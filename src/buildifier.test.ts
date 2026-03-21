import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

vi.mock("vscode");
vi.mock("child_process");
vi.mock("fs");
vi.mock("os", () => ({ platform: () => "darwin" }));

import * as vscode from "vscode";
import { execFileSync, spawn } from "child_process";
import * as fs from "fs";
import { BuildifierFormatProvider } from "./buildifier";
import { EventEmitter } from "events";

function makeConfig(overrides: Record<string, unknown> = {}) {
  const defaults: Record<string, unknown> = {
    "buildifier.path": "buildifier",
    "buildifier.fixLintOnFormat": false,
    ...overrides,
  };
  return { get: vi.fn((key: string, def: unknown) => defaults[key] ?? def) };
}

function makeDocument(text = "x = 1\n", fileName = "/tmp/test.star") {
  return {
    getText: () => text,
    fileName,
    positionAt: (offset: number) => new vscode.Position(0, offset),
  } as unknown as vscode.TextDocument;
}

function makeOutputChannel() {
  return { warn: vi.fn(), error: vi.fn() } as unknown as vscode.LogOutputChannel;
}

const dummyOptions = {} as vscode.FormattingOptions;
const dummyToken = {} as vscode.CancellationToken;

/** Simulate a successful spawn that writes `stdout` to the child's stdout. */
function mockSpawnSuccess(stdout: string) {
  const child = new EventEmitter() as EventEmitter & {
    stdin: { write: Mock; end: Mock };
    stdout: EventEmitter;
    stderr: EventEmitter;
  };
  child.stdin = { write: vi.fn(), end: vi.fn() };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();

  (spawn as unknown as Mock).mockReturnValue(child);

  // Emit data + close on next tick so the promise resolves
  queueMicrotask(() => {
    child.stdout.emit("data", Buffer.from(stdout));
    child.emit("close", 0);
  });
}

function mockSpawnFailure(code: number, stderr: string) {
  const child = new EventEmitter() as EventEmitter & {
    stdin: { write: Mock; end: Mock };
    stdout: EventEmitter;
    stderr: EventEmitter;
  };
  child.stdin = { write: vi.fn(), end: vi.fn() };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();

  (spawn as unknown as Mock).mockReturnValue(child);

  queueMicrotask(() => {
    child.stderr.emit("data", Buffer.from(stderr));
    child.emit("close", code);
  });
}

/** Make `binaryExists` return true (which → success) */
function stubBinaryFound() {
  (execFileSync as unknown as Mock).mockReturnValue(Buffer.from("/usr/local/bin/buildifier\n"));
}

/** Make `binaryExists` return false (which → throws) */
function stubBinaryNotFound() {
  (execFileSync as unknown as Mock).mockImplementation(() => {
    throw new Error("not found");
  });
}

describe("BuildifierFormatProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (fs.existsSync as unknown as Mock).mockReturnValue(false);
  });

  // 1. Returns empty edits when buildifier binary not found
  it("returns empty edits when buildifier binary not found", async () => {
    stubBinaryNotFound();
    (vscode.workspace.getConfiguration as Mock).mockReturnValue(makeConfig());

    const out = makeOutputChannel();
    const provider = new BuildifierFormatProvider(out);
    const result = await provider.provideDocumentFormattingEdits(
      makeDocument(),
      dummyOptions,
      dummyToken,
    );

    expect(result).toEqual([]);
    expect(spawn).not.toHaveBeenCalled();
  });

  // 2. Logs "not found" warning only once across multiple calls
  it("logs not-found warning only once across multiple calls", async () => {
    stubBinaryNotFound();
    (vscode.workspace.getConfiguration as Mock).mockReturnValue(makeConfig());

    const out = makeOutputChannel();
    const provider = new BuildifierFormatProvider(out);

    await provider.provideDocumentFormattingEdits(makeDocument(), dummyOptions, dummyToken);
    await provider.provideDocumentFormattingEdits(makeDocument(), dummyOptions, dummyToken);
    await provider.provideDocumentFormattingEdits(makeDocument(), dummyOptions, dummyToken);

    expect(out.warn).toHaveBeenCalledTimes(1);
  });

  // 3. Uses configured buildifier.path setting for binary lookup
  it("uses configured buildifier.path for binary lookup", async () => {
    (fs.existsSync as unknown as Mock).mockReturnValue(true);
    (vscode.workspace.getConfiguration as Mock).mockReturnValue(
      makeConfig({ "buildifier.path": "/opt/bin/buildifier" }),
    );

    const content = "x = 1\n";
    mockSpawnSuccess(content);

    const out = makeOutputChannel();
    const provider = new BuildifierFormatProvider(out);
    await provider.provideDocumentFormattingEdits(makeDocument(content), dummyOptions, dummyToken);

    expect(spawn).toHaveBeenCalledWith(
      "/opt/bin/buildifier",
      expect.any(Array),
      expect.any(Object),
    );
  });

  // 4. Passes correct base args to buildifier
  it("passes --mode=fix, --type=bzl, --path={fileName} to buildifier", async () => {
    stubBinaryFound();
    (vscode.workspace.getConfiguration as Mock).mockReturnValue(makeConfig());

    const content = "x = 1\n";
    mockSpawnSuccess(content);

    const out = makeOutputChannel();
    const provider = new BuildifierFormatProvider(out);
    await provider.provideDocumentFormattingEdits(
      makeDocument(content, "/workspace/main.star"),
      dummyOptions,
      dummyToken,
    );

    expect(spawn).toHaveBeenCalledWith(
      "buildifier",
      ["--mode=fix", "--type=bzl", "--path=/workspace/main.star"],
      expect.objectContaining({ timeout: 10000 }),
    );
  });

  // 5. Appends --lint=fix when fixLintOnFormat is enabled
  it("appends --lint=fix when fixLintOnFormat is enabled", async () => {
    stubBinaryFound();
    (vscode.workspace.getConfiguration as Mock).mockReturnValue(
      makeConfig({ "buildifier.fixLintOnFormat": true }),
    );

    const content = "x = 1\n";
    mockSpawnSuccess(content);

    const out = makeOutputChannel();
    const provider = new BuildifierFormatProvider(out);
    await provider.provideDocumentFormattingEdits(makeDocument(content), dummyOptions, dummyToken);

    const args = (spawn as unknown as Mock).mock.calls[0][1] as string[];
    expect(args).toContain("--lint=fix");
  });

  // 6. Omits --lint=fix when fixLintOnFormat is disabled
  it("omits --lint=fix when fixLintOnFormat is disabled", async () => {
    stubBinaryFound();
    (vscode.workspace.getConfiguration as Mock).mockReturnValue(makeConfig());

    const content = "x = 1\n";
    mockSpawnSuccess(content);

    const out = makeOutputChannel();
    const provider = new BuildifierFormatProvider(out);
    await provider.provideDocumentFormattingEdits(makeDocument(content), dummyOptions, dummyToken);

    const args = (spawn as unknown as Mock).mock.calls[0][1] as string[];
    expect(args).not.toContain("--lint=fix");
  });

  // 7. Returns empty edits when output matches input (no changes)
  it("returns empty edits when buildifier output matches input", async () => {
    stubBinaryFound();
    (vscode.workspace.getConfiguration as Mock).mockReturnValue(makeConfig());

    const content = "x = 1\n";
    mockSpawnSuccess(content); // same output as input

    const out = makeOutputChannel();
    const provider = new BuildifierFormatProvider(out);
    const result = await provider.provideDocumentFormattingEdits(
      makeDocument(content),
      dummyOptions,
      dummyToken,
    );

    expect(result).toEqual([]);
  });

  // 8. Returns full-document replace when buildifier produces different output
  it("returns TextEdit.replace when buildifier formats the document", async () => {
    stubBinaryFound();
    (vscode.workspace.getConfiguration as Mock).mockReturnValue(makeConfig());

    const input = "x=1\n";
    const formatted = "x = 1\n";
    mockSpawnSuccess(formatted);

    const out = makeOutputChannel();
    const provider = new BuildifierFormatProvider(out);
    const result = await provider.provideDocumentFormattingEdits(
      makeDocument(input),
      dummyOptions,
      dummyToken,
    );

    expect(result).toHaveLength(1);
    expect(vscode.TextEdit.replace).toHaveBeenCalledWith(expect.any(vscode.Range), formatted);
  });
});
