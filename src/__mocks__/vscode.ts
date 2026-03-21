import { vi } from "vitest";

export const Uri = {
  file: (p: string) => ({ fsPath: p, toString: () => p }),
};

export class RelativePattern {
  constructor(
    public base: unknown,
    public pattern: string,
  ) {}
}

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
