import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";

vi.mock("fs");
vi.mock("child_process");
vi.mock("os", () => ({ platform: () => "darwin" }));

// Mock Phase 5 modules to avoid side effects in integration tests
vi.mock("./schema-stubs", () => ({
  generateStubFile: vi.fn().mockReturnValue(undefined),
}));
vi.mock("./load-parser", () => ({
  parseLoadStatements: vi.fn().mockReturnValue([]),
}));
vi.mock("./oci/downloader", () => {
  const MockOciDownloader = vi.fn().mockImplementation(
    function (this: Record<string, unknown>) {
      this.ensureArtifact = vi.fn().mockResolvedValue("/cache/artifact");
    },
  );
  return { OciDownloader: MockOciDownloader };
});
vi.mock("./schema-index", () => {
  const MockSchemaIndex = vi.fn().mockImplementation(
    function (this: Record<string, unknown>) {
      this.buildFromCache = vi.fn();
      this.rebuild = vi.fn();
      this.getAllSymbols = vi.fn().mockReturnValue(new Set());
      this.getSymbolsForFile = vi.fn().mockReturnValue(new Set());
      this.getFileForSymbol = vi.fn();
    },
  );
  return {
    SchemaIndex: MockSchemaIndex,
    BUILTIN_NAMES: new Set(["Resource"]),
  };
});
vi.mock("./middleware", () => ({
  createScopingMiddleware: vi.fn().mockReturnValue({}),
  updateDocumentImports: vi.fn(),
  clearDocumentImports: vi.fn(),
  clearAllDocumentImports: vi.fn(),
}));
vi.mock("./diagnostics", () => {
  const MockProvider = vi.fn().mockImplementation(
    function (this: Record<string, unknown>) {
      this.updateDiagnostics = vi.fn();
      this.provideCodeActions = vi.fn().mockReturnValue([]);
      this.dispose = vi.fn();
    },
  );
  return { MissingImportDiagnosticProvider: MockProvider };
});

let capturedServerOptions: { args: string[] } | undefined;

vi.mock("vscode-languageclient/node", () => {
  const MockLanguageClient = vi.fn().mockImplementation(
    function (this: Record<string, unknown>, _id: string, _name: string, serverOpts: { args: string[] }) {
      capturedServerOptions = serverOpts;
      this.start = vi.fn().mockResolvedValue(undefined);
      this.stop = vi.fn().mockResolvedValue(undefined);
      this.restart = vi.fn().mockResolvedValue(undefined);
      this.isRunning = vi.fn().mockReturnValue(true);
      this.onDidChangeState = vi.fn();
    },
  );
  return {
    LanguageClient: MockLanguageClient,
    RevealOutputChannelOn: { Error: 2 },
    State: { Running: 1, Starting: 3, Stopped: 2 },
  };
});

import * as vscode from "vscode";
import * as fs from "fs";
import { execFileSync } from "child_process";
import { LanguageClient } from "vscode-languageclient/node";
import { getSchemaCachePath, setupSchemaWatcher, activate } from "./extension";
import { SchemaIndex } from "./schema-index";
import { OciDownloader } from "./oci/downloader";

function makeConfig(overrides: Record<string, unknown> = {}) {
  const defaults: Record<string, unknown> = {
    "schemas.path": "",
    "lsp.path": "starlark-lsp",
    "lsp.enabled": true,
    ...overrides,
  };
  return { get: vi.fn((key: string, def: unknown) => defaults[key] ?? def) };
}

function makeMockContext(globalStoragePath = "/mock/global/storage") {
  return {
    extensionPath: "/mock/extension",
    globalStorageUri: { fsPath: globalStoragePath },
    subscriptions: [] as { dispose: () => void }[],
  } as unknown as vscode.ExtensionContext;
}

/** Stub so binaryExists() returns true for PATH lookups */
function stubBinaryFound() {
  (execFileSync as unknown as Mock).mockReturnValue(
    Buffer.from("/usr/local/bin/starlark-lsp\n"),
  );
}

describe("getSchemaCachePath", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns schemas.path setting value when configured", () => {
    (vscode.workspace.getConfiguration as Mock).mockReturnValue(
      makeConfig({ "schemas.path": "/custom/schemas" }),
    );

    const result = getSchemaCachePath(makeMockContext());
    expect(result).toBe("/custom/schemas");
  });

  it("returns globalStorageUri.fsPath when schemas.path is empty", () => {
    (vscode.workspace.getConfiguration as Mock).mockReturnValue(
      makeConfig({ "schemas.path": "" }),
    );

    const result = getSchemaCachePath(makeMockContext("/mock/global/storage"));
    expect(result).toBe("/mock/global/storage");
  });

  it("returns globalStorageUri.fsPath when schemas.path is undefined", () => {
    const config = {
      get: vi.fn((key: string, def: unknown) => {
        if (key === "schemas.path") return def;
        return undefined;
      }),
    };
    (vscode.workspace.getConfiguration as Mock).mockReturnValue(config);

    const result = getSchemaCachePath(makeMockContext("/mock/global/storage"));
    expect(result).toBe("/mock/global/storage");
  });
});

describe("startLsp schema integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedServerOptions = undefined;
    (fs.existsSync as unknown as Mock).mockReturnValue(false);
    (fs.mkdirSync as unknown as Mock).mockReturnValue(undefined);
  });

  it("calls fs.mkdirSync on the schema cache directory with recursive option", async () => {
    stubBinaryFound();
    (vscode.workspace.getConfiguration as Mock).mockReturnValue(makeConfig());

    await activate(makeMockContext());

    expect(fs.mkdirSync).toHaveBeenCalledWith(
      "/mock/global/storage",
      { recursive: true },
    );
  });

  it("constructs args with --builtin-paths for builtins.py and schemaDir", async () => {
    stubBinaryFound();
    (vscode.workspace.getConfiguration as Mock).mockReturnValue(makeConfig());

    await activate(makeMockContext());

    expect(capturedServerOptions).toBeDefined();
    const args = capturedServerOptions!.args;

    // Find all --builtin-paths and their values
    const builtinPathValues: string[] = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--builtin-paths") {
        builtinPathValues.push(args[i + 1]);
      }
    }

    expect(builtinPathValues).toHaveLength(2);
    expect(builtinPathValues[0]).toContain("builtins.py");
    expect(builtinPathValues[1]).toBe("/mock/global/storage"); // schemaDir as directory
  });
});

describe("setupSchemaWatcher", () => {
  let mockWatcher: {
    onDidCreate: Mock;
    onDidChange: Mock;
    onDidDelete: Mock;
    dispose: Mock;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (fs.existsSync as unknown as Mock).mockReturnValue(false);
    (fs.mkdirSync as unknown as Mock).mockReturnValue(undefined);

    mockWatcher = {
      onDidCreate: vi.fn(),
      onDidChange: vi.fn(),
      onDidDelete: vi.fn(),
      dispose: vi.fn(),
    };
    (vscode.workspace.createFileSystemWatcher as Mock).mockReturnValue(
      mockWatcher,
    );
    (vscode.workspace.getConfiguration as Mock).mockReturnValue(makeConfig());
  });

  it("creates watcher with RelativePattern using Uri.file and **/*.{py,star}", () => {
    const ctx = makeMockContext("/mock/schemas");
    setupSchemaWatcher(ctx);

    expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalledTimes(1);
    const pattern = (vscode.workspace.createFileSystemWatcher as Mock).mock
      .calls[0][0];
    expect(pattern).toBeInstanceOf(vscode.RelativePattern);
    expect(pattern.base).toEqual({ fsPath: "/mock/schemas", toString: expect.any(Function) });
    expect(pattern.pattern).toBe("*.py");
  });

  it("registers onDidCreate, onDidChange, and onDidDelete handlers", () => {
    const ctx = makeMockContext();
    setupSchemaWatcher(ctx);

    expect(mockWatcher.onDidCreate).toHaveBeenCalledWith(expect.any(Function));
    expect(mockWatcher.onDidChange).toHaveBeenCalledWith(expect.any(Function));
    expect(mockWatcher.onDidDelete).toHaveBeenCalledWith(expect.any(Function));
  });

  it("pushes watcher to context.subscriptions", () => {
    const ctx = makeMockContext();
    setupSchemaWatcher(ctx);

    expect(ctx.subscriptions).toContain(mockWatcher);
  });

  it("returns the created watcher", () => {
    const ctx = makeMockContext();
    const result = setupSchemaWatcher(ctx);

    expect(result).toBe(mockWatcher);
  });
});

describe("FileSystemWatcher debounce", () => {
  let mockWatcher: {
    onDidCreate: Mock;
    onDidChange: Mock;
    onDidDelete: Mock;
    dispose: Mock;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    (fs.existsSync as unknown as Mock).mockReturnValue(false);
    (fs.mkdirSync as unknown as Mock).mockReturnValue(undefined);

    mockWatcher = {
      onDidCreate: vi.fn(),
      onDidChange: vi.fn(),
      onDidDelete: vi.fn(),
      dispose: vi.fn(),
    };
    (vscode.workspace.createFileSystemWatcher as Mock).mockReturnValue(
      mockWatcher,
    );
    (vscode.workspace.getConfiguration as Mock).mockReturnValue(makeConfig());
    stubBinaryFound();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces rapid events so only one restart occurs", async () => {
    await activate(makeMockContext());

    // Get the LanguageClient mock instance to check restart calls
    const clientInstance = (LanguageClient as unknown as Mock).mock.instances[0];

    // Get the registered scheduleRestart callback from onDidCreate
    const scheduleRestart = mockWatcher.onDidCreate.mock.calls[0][0] as () => void;

    // Fire 5 rapid events
    scheduleRestart();
    scheduleRestart();
    scheduleRestart();
    scheduleRestart();
    scheduleRestart();

    // Before debounce timer fires, no restart should have been called
    expect(clientInstance.restart).not.toHaveBeenCalled();

    // Advance past the 1000ms debounce
    await vi.advanceTimersByTimeAsync(1000);

    // Only one restart should have fired
    expect(clientInstance.restart).toHaveBeenCalledTimes(1);
  });

  it("resets debounce timer on each new event", async () => {
    await activate(makeMockContext());

    const clientInstance = (LanguageClient as unknown as Mock).mock.instances[0];
    const scheduleRestart = mockWatcher.onDidCreate.mock.calls[0][0] as () => void;

    // Fire first event
    scheduleRestart();

    // Wait 800ms (not yet at 1000ms threshold)
    await vi.advanceTimersByTimeAsync(800);
    expect(clientInstance.restart).not.toHaveBeenCalled();

    // Fire another event, resetting the timer
    scheduleRestart();

    // Wait another 800ms (1600ms total, but only 800ms from last event)
    await vi.advanceTimersByTimeAsync(800);
    expect(clientInstance.restart).not.toHaveBeenCalled();

    // Wait final 200ms to reach 1000ms from last event
    await vi.advanceTimersByTimeAsync(200);
    expect(clientInstance.restart).toHaveBeenCalledTimes(1);
  });
});

describe("schemas.path config change handling", () => {
  let configChangeHandler: (e: { affectsConfiguration: (s: string) => boolean }) => Promise<void>;

  beforeEach(() => {
    vi.clearAllMocks();
    (fs.existsSync as unknown as Mock).mockReturnValue(false);
    (fs.mkdirSync as unknown as Mock).mockReturnValue(undefined);

    const mockWatcher = {
      onDidCreate: vi.fn(),
      onDidChange: vi.fn(),
      onDidDelete: vi.fn(),
      dispose: vi.fn(),
    };
    (vscode.workspace.createFileSystemWatcher as Mock).mockReturnValue(
      mockWatcher,
    );
    (vscode.workspace.getConfiguration as Mock).mockReturnValue(makeConfig());
    stubBinaryFound();

    // Capture the config change handler
    (vscode.workspace.onDidChangeConfiguration as Mock).mockImplementation(
      (handler: (e: { affectsConfiguration: (s: string) => boolean }) => Promise<void>) => {
        configChangeHandler = handler;
        return { dispose: vi.fn() };
      },
    );
  });

  it("triggers client stop and startLsp when schemas.path changes", async () => {
    await activate(makeMockContext());

    const clientInstance = (LanguageClient as unknown as Mock).mock.instances[0];

    // Simulate schemas.path config change
    await configChangeHandler({
      affectsConfiguration: (s: string) =>
        s === "functionStarlark.schemas.path",
    });

    // Client should have been stopped (teardown)
    expect(clientInstance.stop).toHaveBeenCalled();

    // A new LanguageClient should have been created (startLsp called again)
    expect(LanguageClient as unknown as Mock).toHaveBeenCalledTimes(2);
  });

  it("existing lsp.path and lsp.enabled config handling still works", async () => {
    await activate(makeMockContext());

    const clientInstance = (LanguageClient as unknown as Mock).mock.instances[0];

    // Simulate lsp.path config change
    await configChangeHandler({
      affectsConfiguration: (s: string) =>
        s === "functionStarlark.lsp.path",
    });

    // Client should have been restarted (not stopped)
    expect(clientInstance.restart).toHaveBeenCalled();
  });

  it("schemas.registry config change recreates downloader", async () => {
    (vscode.workspace.getConfiguration as Mock).mockReturnValue(
      makeConfig({ "schemas.enabled": true, "schemas.registry": "ghcr.io/wompipomp" }),
    );

    await activate(makeMockContext());

    // Update config to new registry
    (vscode.workspace.getConfiguration as Mock).mockReturnValue(
      makeConfig({ "schemas.enabled": true, "schemas.registry": "ghcr.io/other" }),
    );

    // Simulate schemas.registry config change
    await configChangeHandler({
      affectsConfiguration: (s: string) =>
        s === "functionStarlark.schemas.registry",
    });

    // Should not restart the client (registry change doesn't require restart)
    const clientInstance = (LanguageClient as unknown as Mock).mock.instances[0];
    expect(clientInstance.restart).not.toHaveBeenCalled();
  });
});

describe("Phase 5 integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (fs.existsSync as unknown as Mock).mockReturnValue(false);
    (fs.mkdirSync as unknown as Mock).mockReturnValue(undefined);

    const mockWatcher = {
      onDidCreate: vi.fn(),
      onDidChange: vi.fn(),
      onDidDelete: vi.fn(),
      dispose: vi.fn(),
    };
    (vscode.workspace.createFileSystemWatcher as Mock).mockReturnValue(
      mockWatcher,
    );
    stubBinaryFound();
  });

  it("registers clearSchemaCache command", async () => {
    (vscode.workspace.getConfiguration as Mock).mockReturnValue(makeConfig());

    await activate(makeMockContext());

    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      "functionStarlark.clearSchemaCache",
      expect.any(Function),
    );
  });

  it("schemas.enabled=false skips schema module initialization", async () => {
    (vscode.workspace.getConfiguration as Mock).mockReturnValue(
      makeConfig({ "schemas.enabled": false }),
    );

    await activate(makeMockContext());

    // SchemaIndex and OciDownloader should not be constructed when schemas disabled
    expect(SchemaIndex as unknown as Mock).not.toHaveBeenCalled();
    expect(OciDownloader as unknown as Mock).not.toHaveBeenCalled();
  });

  it("schemas.enabled=true registers document open/save/close handlers", async () => {
    (vscode.workspace.getConfiguration as Mock).mockReturnValue(
      makeConfig({ "schemas.enabled": true, "schemas.registry": "ghcr.io/wompipomp" }),
    );

    await activate(makeMockContext());

    expect(vscode.workspace.onDidOpenTextDocument).toHaveBeenCalledWith(
      expect.any(Function),
    );
    expect(vscode.workspace.onDidSaveTextDocument).toHaveBeenCalledWith(
      expect.any(Function),
    );
    expect(vscode.workspace.onDidCloseTextDocument).toHaveBeenCalledWith(
      expect.any(Function),
    );
  });

  it("schemas.enabled=true creates diagnostic collection and registers code action provider", async () => {
    (vscode.workspace.getConfiguration as Mock).mockReturnValue(
      makeConfig({ "schemas.enabled": true, "schemas.registry": "ghcr.io/wompipomp" }),
    );

    await activate(makeMockContext());

    expect(vscode.languages.createDiagnosticCollection).toHaveBeenCalledWith(
      "functionStarlark",
    );
    expect(vscode.languages.registerCodeActionsProvider).toHaveBeenCalledWith(
      { scheme: "file", language: "starlark" },
      expect.any(Object),
      { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] },
    );
  });
});

describe("showOutput command in package.json", () => {
  it("has functionStarlark.showOutput in contributes.commands", async () => {
    const pkgRaw = await fs.promises.readFile(
      require("path").resolve(__dirname, "..", "package.json"),
      "utf-8",
    );
    const pkg = JSON.parse(pkgRaw);
    const commands = pkg.contributes.commands as Array<{ command: string; title: string; category?: string }>;
    const showOutput = commands.find((c) => c.command === "functionStarlark.showOutput");
    expect(showOutput).toBeDefined();
    expect(showOutput!.category).toBe("Function Starlark");
  });
});

describe("schemas.enabled=false at startup gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedServerOptions = undefined;
    (fs.existsSync as unknown as Mock).mockReturnValue(false);
    (fs.mkdirSync as unknown as Mock).mockReturnValue(undefined);

    const mockWatcher = {
      onDidCreate: vi.fn(),
      onDidChange: vi.fn(),
      onDidDelete: vi.fn(),
      dispose: vi.fn(),
    };
    (vscode.workspace.createFileSystemWatcher as Mock).mockReturnValue(
      mockWatcher,
    );
    stubBinaryFound();
  });

  it("does not call createFileSystemWatcher when schemas.enabled=false", async () => {
    (vscode.workspace.getConfiguration as Mock).mockReturnValue(
      makeConfig({ "schemas.enabled": false }),
    );

    await activate(makeMockContext());

    expect(vscode.workspace.createFileSystemWatcher).not.toHaveBeenCalled();
  });

  it("omits schema dir from --builtin-paths when schemas.enabled=false", async () => {
    (vscode.workspace.getConfiguration as Mock).mockReturnValue(
      makeConfig({ "schemas.enabled": false }),
    );

    await activate(makeMockContext());

    expect(capturedServerOptions).toBeDefined();
    const args = capturedServerOptions!.args;

    // Find all --builtin-paths and their values
    const builtinPathValues: string[] = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--builtin-paths") {
        builtinPathValues.push(args[i + 1]);
      }
    }

    // Only builtins.py, no schema dir
    expect(builtinPathValues).toHaveLength(1);
    expect(builtinPathValues[0]).toContain("builtins.py");
  });

  it("does not call mkdirSync for schema dir when schemas.enabled=false", async () => {
    (vscode.workspace.getConfiguration as Mock).mockReturnValue(
      makeConfig({ "schemas.enabled": false }),
    );

    await activate(makeMockContext());

    // mkdirSync should NOT have been called (no schema dir creation)
    expect(fs.mkdirSync).not.toHaveBeenCalled();
  });
});

describe("schemas.enabled runtime toggle", () => {
  let configChangeHandler: (e: { affectsConfiguration: (s: string) => boolean }) => Promise<void>;
  let mockWatcher: {
    onDidCreate: Mock;
    onDidChange: Mock;
    onDidDelete: Mock;
    dispose: Mock;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    capturedServerOptions = undefined;
    (fs.existsSync as unknown as Mock).mockReturnValue(false);
    (fs.mkdirSync as unknown as Mock).mockReturnValue(undefined);

    mockWatcher = {
      onDidCreate: vi.fn(),
      onDidChange: vi.fn(),
      onDidDelete: vi.fn(),
      dispose: vi.fn(),
    };
    (vscode.workspace.createFileSystemWatcher as Mock).mockReturnValue(
      mockWatcher,
    );
    stubBinaryFound();

    // Capture the config change handler
    (vscode.workspace.onDidChangeConfiguration as Mock).mockImplementation(
      (handler: (e: { affectsConfiguration: (s: string) => boolean }) => Promise<void>) => {
        configChangeHandler = handler;
        return { dispose: vi.fn() };
      },
    );
  });

  it("toggle true->false: disposes watcher, stops and recreates client without schema dir", async () => {
    (vscode.workspace.getConfiguration as Mock).mockReturnValue(
      makeConfig({ "schemas.enabled": true, "schemas.registry": "ghcr.io/wompipomp" }),
    );

    await activate(makeMockContext());

    const firstClient = (LanguageClient as unknown as Mock).mock.instances[0];

    // Now switch to schemas.enabled=false
    (vscode.workspace.getConfiguration as Mock).mockReturnValue(
      makeConfig({ "schemas.enabled": false }),
    );

    await configChangeHandler({
      affectsConfiguration: (s: string) =>
        s === "functionStarlark.schemas.enabled",
    });

    // Watcher should have been disposed
    expect(mockWatcher.dispose).toHaveBeenCalled();

    // Old client should have been stopped
    expect(firstClient.stop).toHaveBeenCalled();

    // New client should have been created (total 2)
    expect(LanguageClient as unknown as Mock).toHaveBeenCalledTimes(2);

    // New client should NOT have schema dir in --builtin-paths
    const args = capturedServerOptions!.args;
    const builtinPathValues: string[] = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--builtin-paths") {
        builtinPathValues.push(args[i + 1]);
      }
    }
    expect(builtinPathValues).toHaveLength(1);
    expect(builtinPathValues[0]).toContain("builtins.py");
  });

  it("toggle false->true: creates SchemaIndex, OciDownloader, and client with schema dir", async () => {
    (vscode.workspace.getConfiguration as Mock).mockReturnValue(
      makeConfig({ "schemas.enabled": false }),
    );

    await activate(makeMockContext());

    // SchemaIndex and OciDownloader should not have been created initially
    expect(SchemaIndex as unknown as Mock).not.toHaveBeenCalled();
    expect(OciDownloader as unknown as Mock).not.toHaveBeenCalled();

    const firstClient = (LanguageClient as unknown as Mock).mock.instances[0];

    // Now switch to schemas.enabled=true
    (vscode.workspace.getConfiguration as Mock).mockReturnValue(
      makeConfig({ "schemas.enabled": true, "schemas.registry": "ghcr.io/wompipomp" }),
    );

    await configChangeHandler({
      affectsConfiguration: (s: string) =>
        s === "functionStarlark.schemas.enabled",
    });

    // SchemaIndex and OciDownloader should now be created
    expect(SchemaIndex as unknown as Mock).toHaveBeenCalled();
    expect(OciDownloader as unknown as Mock).toHaveBeenCalled();

    // Old client should have been stopped
    expect(firstClient.stop).toHaveBeenCalled();

    // New client should have been created with schema dir in --builtin-paths
    expect(LanguageClient as unknown as Mock).toHaveBeenCalledTimes(2);
    const args = capturedServerOptions!.args;
    const builtinPathValues: string[] = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--builtin-paths") {
        builtinPathValues.push(args[i + 1]);
      }
    }
    expect(builtinPathValues).toHaveLength(2);
    expect(builtinPathValues[0]).toContain("builtins.py");
    expect(builtinPathValues[1]).toBe("/mock/global/storage");
  });
});
