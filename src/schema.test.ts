import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

vi.mock("vscode");
vi.mock("fs");
vi.mock("child_process");
vi.mock("os", () => ({ platform: () => "darwin" }));
vi.mock("vscode-languageclient/node", () => ({
  LanguageClient: vi.fn().mockImplementation(() => ({
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    restart: vi.fn().mockResolvedValue(undefined),
    isRunning: vi.fn().mockReturnValue(true),
    onDidChangeState: vi.fn(),
  })),
  RevealOutputChannelOn: { Error: 2 },
  State: { Running: 1, Starting: 3, Stopped: 2 },
}));

import * as vscode from "vscode";
import * as fs from "fs";
import { getSchemaCachePath } from "./extension";

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
    (fs.existsSync as unknown as Mock).mockReturnValue(false);
    (fs.mkdirSync as unknown as Mock).mockReturnValue(undefined);
  });

  it("calls fs.mkdirSync on the schema cache directory with recursive option", async () => {
    const { execFileSync } = await import("child_process");
    (execFileSync as unknown as Mock).mockReturnValue(
      Buffer.from("/usr/local/bin/starlark-lsp\n"),
    );
    (vscode.workspace.getConfiguration as Mock).mockReturnValue(
      makeConfig(),
    );

    const { LanguageClient } = await import("vscode-languageclient/node");
    const mockClient = {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      restart: vi.fn().mockResolvedValue(undefined),
      isRunning: vi.fn().mockReturnValue(true),
      onDidChangeState: vi.fn(),
    };
    (LanguageClient as unknown as Mock).mockImplementation(() => mockClient);

    const { activate } = await import("./extension");
    const ctx = makeMockContext();
    (vscode.window.createOutputChannel as unknown as Mock).mockReturnValue({
      log: true,
    });
    (vscode.window.createStatusBarItem as unknown as Mock).mockReturnValue({
      show: vi.fn(),
      hide: vi.fn(),
      dispose: vi.fn(),
      text: "",
      command: "",
      tooltip: "",
    });
    (vscode.commands.registerCommand as unknown as Mock).mockReturnValue({
      dispose: vi.fn(),
    });
    (vscode.languages.registerDocumentFormattingEditProvider as unknown as Mock).mockReturnValue({
      dispose: vi.fn(),
    });
    (vscode.workspace.onDidChangeConfiguration as unknown as Mock).mockReturnValue({
      dispose: vi.fn(),
    });
    (vscode.window.onDidChangeActiveTextEditor as unknown as Mock).mockReturnValue({
      dispose: vi.fn(),
    });

    await activate(ctx);

    expect(fs.mkdirSync).toHaveBeenCalledWith(
      "/mock/global/storage",
      { recursive: true },
    );
  });

  it("constructs args with two --builtin-paths: builtins.py and schema cache dir", async () => {
    const { execFileSync } = await import("child_process");
    (execFileSync as unknown as Mock).mockReturnValue(
      Buffer.from("/usr/local/bin/starlark-lsp\n"),
    );
    (vscode.workspace.getConfiguration as Mock).mockReturnValue(
      makeConfig(),
    );

    const { LanguageClient } = await import("vscode-languageclient/node");
    let capturedServerOptions: unknown;
    (LanguageClient as unknown as Mock).mockImplementation(
      (_id: string, _name: string, serverOpts: unknown) => {
        capturedServerOptions = serverOpts;
        return {
          start: vi.fn().mockResolvedValue(undefined),
          stop: vi.fn().mockResolvedValue(undefined),
          restart: vi.fn().mockResolvedValue(undefined),
          isRunning: vi.fn().mockReturnValue(true),
          onDidChangeState: vi.fn(),
        };
      },
    );

    (vscode.window.createOutputChannel as unknown as Mock).mockReturnValue({
      log: true,
    });
    (vscode.window.createStatusBarItem as unknown as Mock).mockReturnValue({
      show: vi.fn(),
      hide: vi.fn(),
      dispose: vi.fn(),
      text: "",
      command: "",
      tooltip: "",
    });
    (vscode.commands.registerCommand as unknown as Mock).mockReturnValue({
      dispose: vi.fn(),
    });
    (vscode.languages.registerDocumentFormattingEditProvider as unknown as Mock).mockReturnValue({
      dispose: vi.fn(),
    });
    (vscode.workspace.onDidChangeConfiguration as unknown as Mock).mockReturnValue({
      dispose: vi.fn(),
    });
    (vscode.window.onDidChangeActiveTextEditor as unknown as Mock).mockReturnValue({
      dispose: vi.fn(),
    });

    const { activate } = await import("./extension");
    const ctx = makeMockContext();

    await activate(ctx);

    const opts = capturedServerOptions as { args: string[] };
    expect(opts.args).toContain("--builtin-paths");

    // Find all --builtin-paths and their values
    const builtinPathValues: string[] = [];
    for (let i = 0; i < opts.args.length; i++) {
      if (opts.args[i] === "--builtin-paths") {
        builtinPathValues.push(opts.args[i + 1]);
      }
    }

    expect(builtinPathValues).toHaveLength(2);
    expect(builtinPathValues[0]).toContain("builtins.py");
    expect(builtinPathValues[1]).toBe("/mock/global/storage");
  });
});
