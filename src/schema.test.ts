import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

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
import { getSchemaCachePath, activate } from "./extension";

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
