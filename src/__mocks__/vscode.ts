import { vi } from "vitest";

export const Uri = {
  file: vi.fn((p: string) => ({ fsPath: p, toString: () => p })),
  parse: vi.fn((s: string) => ({ fsPath: s, toString: () => s })),
};

export class RelativePattern {
  constructor(
    public base: unknown,
    public pattern: string,
  ) {}
}

export const StatusBarAlignment = { Left: 1, Right: 2 };

export const workspace = {
  getConfiguration: vi.fn(),
  createFileSystemWatcher: vi.fn(() => ({
    onDidCreate: vi.fn(),
    onDidChange: vi.fn(),
    onDidDelete: vi.fn(),
    dispose: vi.fn(),
  })),
  onDidChangeConfiguration: vi.fn(),
};

export const window = {
  createOutputChannel: vi.fn(() => ({
    appendLine: vi.fn(),
    show: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    log: true,
  })),
  createStatusBarItem: vi.fn(() => ({
    show: vi.fn(),
    hide: vi.fn(),
    dispose: vi.fn(),
    text: "",
    command: "",
    tooltip: "",
  })),
  showWarningMessage: vi.fn(),
  showInformationMessage: vi.fn(),
  createTerminal: vi.fn(() => ({ show: vi.fn(), sendText: vi.fn() })),
  onDidChangeActiveTextEditor: vi.fn(() => ({ dispose: vi.fn() })),
  activeTextEditor: undefined,
};

export const commands = {
  registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
  executeCommand: vi.fn(),
};

export const languages = {
  registerDocumentFormattingEditProvider: vi.fn(() => ({ dispose: vi.fn() })),
};

export const env = {
  openExternal: vi.fn(),
};

export class Range {
  constructor(
    public start: Position,
    public end: Position,
  ) {}
}

export class Position {
  constructor(
    public line: number,
    public character: number,
  ) {}
}

export const TextEdit = {
  replace: vi.fn((range: Range, newText: string) => ({ range, newText })),
};
