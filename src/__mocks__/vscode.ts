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
  onDidOpenTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
  onDidSaveTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
  onDidChangeTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
  onDidCloseTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
  textDocuments: [] as unknown[],
};

export const window = {
  createOutputChannel: vi.fn(() => ({
    appendLine: vi.fn(),
    show: vi.fn(),
    info: vi.fn(),
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

export const DiagnosticSeverity = {
  Error: 0,
  Warning: 1,
  Information: 2,
  Hint: 3,
};

export class Diagnostic {
  range: Range;
  message: string;
  severity: number;
  source?: string;
  code?: string | number;
  constructor(range: Range, message: string, severity?: number) {
    this.range = range;
    this.message = message;
    this.severity = severity ?? 0;
  }
}

export class CodeAction {
  title: string;
  kind?: unknown;
  edit?: unknown;
  diagnostics?: Diagnostic[];
  isPreferred?: boolean;
  constructor(title: string, kind?: unknown) {
    this.title = title;
    this.kind = kind;
  }
}

export const CodeActionKind = {
  QuickFix: "quickfix",
};

export class SnippetString {
  value: string;
  constructor(value?: string) {
    this.value = value ?? "";
  }
  appendText(str: string): this {
    this.value += str.replace(/[\$\}\\]/g, "\\$&");
    return this;
  }
  appendTabstop(num: number): this {
    this.value += `$${num}`;
    return this;
  }
  appendPlaceholder(val: string, num: number): this {
    this.value += `\${${num}:${val}}`;
    return this;
  }
}

export class SnippetTextEdit {
  range: Range;
  snippet: SnippetString;
  constructor(range: Range, snippet: SnippetString) {
    this.range = range;
    this.snippet = snippet;
  }
  static insert(position: Position, snippet: SnippetString): SnippetTextEdit {
    return new SnippetTextEdit(new Range(position, position), snippet);
  }
  static replace(range: Range, snippet: SnippetString): SnippetTextEdit {
    return new SnippetTextEdit(range, snippet);
  }
}

export class WorkspaceEdit {
  private _edits: Array<{ uri: unknown; position: unknown; text: string }> = [];
  private _setEdits: Array<[unknown, unknown[]]> = [];
  insert(uri: unknown, position: unknown, text: string): void {
    this._edits.push({ uri, position, text });
  }
  set(uri: unknown, edits: unknown[]): void {
    this._setEdits.push([uri, edits]);
  }
  get edits() {
    return this._edits;
  }
  get setEdits() {
    return this._setEdits;
  }
}

export const languages = {
  registerDocumentFormattingEditProvider: vi.fn(() => ({ dispose: vi.fn() })),
  createDiagnosticCollection: vi.fn(() => ({
    set: vi.fn(),
    delete: vi.fn(),
    clear: vi.fn(),
    dispose: vi.fn(),
  })),
  registerCodeActionsProvider: vi.fn(() => ({ dispose: vi.fn() })),
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

export class Location {
  constructor(
    public uri: { fsPath: string; toString: () => string },
    public range: Range,
  ) {}
}

export class DiagnosticRelatedInformation {
  constructor(
    public location: Location,
    public message: string,
  ) {}
}

export const SymbolKind = {
  File: 0,
  Module: 1,
  Namespace: 2,
  Package: 3,
  Class: 4,
  Method: 5,
  Property: 6,
  Field: 7,
  Constructor: 8,
  Enum: 9,
  Interface: 10,
  Function: 11,
  Variable: 12,
};

export class DocumentSymbol {
  name: string;
  detail: string;
  kind: number;
  range: Range;
  selectionRange: Range;
  children: DocumentSymbol[] = [];
  constructor(name: string, detail: string, kind: number, range: Range, selectionRange: Range) {
    this.name = name;
    this.detail = detail;
    this.kind = kind;
    this.range = range;
    this.selectionRange = selectionRange;
  }
}

export class ThemeColor {
  id: string;
  constructor(id: string) {
    this.id = id;
  }
}

export const TextEdit = {
  replace: vi.fn((range: Range, newText: string) => ({ range, newText })),
};

export class MarkdownString {
  value: string;
  isTrusted?: boolean;
  constructor(value?: string) {
    this.value = value ?? "";
  }
  appendCodeblock(code: string, language?: string): this {
    this.value += `\`\`\`${language ?? ""}\n${code}\n\`\`\`\n`;
    return this;
  }
  appendMarkdown(markdown: string): this {
    this.value += markdown;
    return this;
  }
  appendText(text: string): this {
    this.value += text;
    return this;
  }
}

export class Hover {
  contents: (MarkdownString | string)[];
  range?: Range;
  constructor(contents: MarkdownString | string | (MarkdownString | string)[], range?: Range) {
    this.contents = Array.isArray(contents) ? contents : [contents];
    this.range = range;
  }
}
