import { vi } from "vitest";

export const workspace = {
  getConfiguration: vi.fn(),
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
