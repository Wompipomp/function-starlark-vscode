import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";

vi.mock("vscode");
vi.mock("fs");
vi.mock("child_process");
vi.mock("os", () => ({ platform: () => "darwin" }));

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

  it("constructs args with two --builtin-paths: builtins.py and schema cache dir", async () => {
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
    expect(builtinPathValues[1]).toBe("/mock/global/storage");
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

  it("creates watcher with RelativePattern using Uri.file and **/*.py", () => {
    const ctx = makeMockContext("/mock/schemas");
    setupSchemaWatcher(ctx);

    expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalledTimes(1);
    const pattern = (vscode.workspace.createFileSystemWatcher as Mock).mock
      .calls[0][0];
    expect(pattern).toBeInstanceOf(vscode.RelativePattern);
    expect(pattern.base).toEqual({ fsPath: "/mock/schemas", toString: expect.any(Function) });
    expect(pattern.pattern).toBe("**/*.py");
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

    // Advance past the 400ms debounce
    await vi.advanceTimersByTimeAsync(400);

    // Only one restart should have fired
    expect(clientInstance.restart).toHaveBeenCalledTimes(1);
  });

  it("resets debounce timer on each new event", async () => {
    await activate(makeMockContext());

    const clientInstance = (LanguageClient as unknown as Mock).mock.instances[0];
    const scheduleRestart = mockWatcher.onDidCreate.mock.calls[0][0] as () => void;

    // Fire first event
    scheduleRestart();

    // Wait 300ms (not yet at 400ms threshold)
    await vi.advanceTimersByTimeAsync(300);
    expect(clientInstance.restart).not.toHaveBeenCalled();

    // Fire another event, resetting the timer
    scheduleRestart();

    // Wait another 300ms (600ms total, but only 300ms from last event)
    await vi.advanceTimersByTimeAsync(300);
    expect(clientInstance.restart).not.toHaveBeenCalled();

    // Wait final 100ms to reach 400ms from last event
    await vi.advanceTimersByTimeAsync(100);
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
});
