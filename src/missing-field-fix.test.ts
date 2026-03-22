import { describe, it, expect, vi, beforeEach } from "vitest";
import * as vscode from "vscode";
import type { SchemaIndex } from "./schema-index";
import type { ParsedSchema } from "./schema-stubs";

// Will be created in GREEN phase
import { MissingFieldQuickFixProvider } from "./missing-field-fix";

function createMockSchemaIndex(schemas?: Map<string, ParsedSchema>): SchemaIndex {
  return {
    getSchemaMetadata: vi.fn((name: string) => schemas?.get(name)),
    getSymbolsForFile: vi.fn(() => new Set()),
    getAllSymbols: vi.fn(() => new Set()),
    getFileForSymbol: vi.fn(() => undefined),
    buildFromCache: vi.fn(),
    rebuild: vi.fn(),
  } as unknown as SchemaIndex;
}

function createMockDocument(text: string): vscode.TextDocument {
  const lines = text.split("\n");

  function positionAt(offset: number): vscode.Position {
    let remaining = offset;
    for (let line = 0; line < lines.length; line++) {
      // +1 for newline char (except last line)
      const lineLen = line < lines.length - 1 ? lines[line].length + 1 : lines[line].length;
      if (remaining < lineLen) {
        return new vscode.Position(line, remaining);
      }
      remaining -= lineLen;
    }
    return new vscode.Position(lines.length - 1, lines[lines.length - 1].length);
  }

  function offsetAt(position: vscode.Position): number {
    let offset = 0;
    for (let i = 0; i < position.line && i < lines.length; i++) {
      offset += lines[i].length + 1; // +1 for newline
    }
    offset += position.character;
    return offset;
  }

  return {
    uri: { toString: () => "file:///test.star", fsPath: "/test.star" },
    getText: () => text,
    positionAt,
    offsetAt,
    languageId: "starlark",
  } as unknown as vscode.TextDocument;
}

function createDiagnostic(
  range: vscode.Range,
  message: string,
  code: string,
  source: string,
): vscode.Diagnostic {
  const diag = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Warning);
  diag.source = source;
  diag.code = code;
  return diag;
}

const ACCOUNT_SCHEMA: ParsedSchema = {
  name: "Account",
  doc: "An account resource",
  fields: [
    { name: "name", type: "string", required: true, doc: "Account name" },
    { name: "location", type: "string", required: true, doc: "Account location" },
    { name: "replicas", type: "int", required: false, doc: "Number of replicas" },
  ],
};

const DEPLOYMENT_SCHEMA: ParsedSchema = {
  name: "Deployment",
  doc: "A deployment",
  fields: [
    { name: "name", type: "string", required: true, doc: "Name" },
    { name: "replicas", type: "int", required: true, doc: "Replicas" },
    { name: "enabled", type: "bool", required: true, doc: "Enabled" },
    { name: "metadata", type: "ObjectMeta", required: true, doc: "Metadata" },
    { name: "labels", type: "", required: true, doc: "Labels" },
  ],
};

describe("MissingFieldQuickFixProvider", () => {
  let schemas: Map<string, ParsedSchema>;

  beforeEach(() => {
    schemas = new Map<string, ParsedSchema>();
    schemas.set("Account", ACCOUNT_SCHEMA);
    schemas.set("Deployment", DEPLOYMENT_SCHEMA);
  });

  it("returns empty array when no missing-field diagnostics present", () => {
    const index = createMockSchemaIndex(schemas);
    const provider = new MissingFieldQuickFixProvider(index);
    const doc = createMockDocument("Account()\n");

    const context = {
      diagnostics: [] as vscode.Diagnostic[],
      triggerKind: 1,
      only: undefined,
    } as unknown as vscode.CodeActionContext;

    const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 7));
    const actions = provider.provideCodeActions(doc, range, context);
    expect(actions).toEqual([]);
  });

  it("returns empty array when diagnostics have wrong source or code", () => {
    const index = createMockSchemaIndex(schemas);
    const provider = new MissingFieldQuickFixProvider(index);
    const doc = createMockDocument("Account()\n");

    const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 7));

    // Wrong source
    const diag1 = createDiagnostic(range, 'Missing required field "name" in Account()', "missing-field", "otherSource");
    // Wrong code
    const diag2 = createDiagnostic(range, 'Unknown field "foo" in Account()', "unknown-field", "functionStarlark");

    const context = {
      diagnostics: [diag1, diag2],
      triggerKind: 1,
      only: undefined,
    } as unknown as vscode.CodeActionContext;

    const actions = provider.provideCodeActions(doc, range, context);
    expect(actions).toEqual([]);
  });

  it("creates single action grouping all missing fields for one constructor", () => {
    const index = createMockSchemaIndex(schemas);
    const provider = new MissingFieldQuickFixProvider(index);
    const doc = createMockDocument("Account()\n");

    const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 7));
    const diag1 = createDiagnostic(range, 'Missing required field "name" in Account()', "missing-field", "functionStarlark");
    const diag2 = createDiagnostic(range, 'Missing required field "location" in Account()', "missing-field", "functionStarlark");

    const context = {
      diagnostics: [diag1, diag2],
      triggerKind: 1,
      only: undefined,
    } as unknown as vscode.CodeActionContext;

    const actions = provider.provideCodeActions(doc, range, context);
    expect(actions).toHaveLength(1);
  });

  it('action title format: "Add missing required fields (field1, field2)"', () => {
    const index = createMockSchemaIndex(schemas);
    const provider = new MissingFieldQuickFixProvider(index);
    const doc = createMockDocument("Account()\n");

    const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 7));
    const diag1 = createDiagnostic(range, 'Missing required field "name" in Account()', "missing-field", "functionStarlark");
    const diag2 = createDiagnostic(range, 'Missing required field "location" in Account()', "missing-field", "functionStarlark");

    const context = {
      diagnostics: [diag1, diag2],
      triggerKind: 1,
      only: undefined,
    } as unknown as vscode.CodeActionContext;

    const actions = provider.provideCodeActions(doc, range, context);
    expect(actions[0].title).toBe("Add missing required fields (name, location)");
  });

  it("snippet uses typed placeholders -- string, int, bool, PascalCase, unknown", () => {
    const index = createMockSchemaIndex(schemas);
    const provider = new MissingFieldQuickFixProvider(index);
    const doc = createMockDocument("Deployment()\n");

    const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 10));
    const diag1 = createDiagnostic(range, 'Missing required field "name" in Deployment()', "missing-field", "functionStarlark");
    const diag2 = createDiagnostic(range, 'Missing required field "replicas" in Deployment()', "missing-field", "functionStarlark");
    const diag3 = createDiagnostic(range, 'Missing required field "enabled" in Deployment()', "missing-field", "functionStarlark");
    const diag4 = createDiagnostic(range, 'Missing required field "metadata" in Deployment()', "missing-field", "functionStarlark");
    const diag5 = createDiagnostic(range, 'Missing required field "labels" in Deployment()', "missing-field", "functionStarlark");

    const context = {
      diagnostics: [diag1, diag2, diag3, diag4, diag5],
      triggerKind: 1,
      only: undefined,
    } as unknown as vscode.CodeActionContext;

    const actions = provider.provideCodeActions(doc, range, context);
    expect(actions).toHaveLength(1);

    const edit = actions[0].edit as vscode.WorkspaceEdit;
    const setEdits = (edit as unknown as { setEdits: Array<[unknown, unknown[]]> }).setEdits;
    expect(setEdits).toHaveLength(1);

    const snippetEdit = setEdits[0][1][0] as { snippet: { value: string } };
    const snippetValue = snippetEdit.snippet.value;

    // string field: "cursor-inside-quotes" pattern -> appendText('"') + appendTabstop + appendText('"')
    expect(snippetValue).toContain('name = \\"$1\\"');
    // int field: appendPlaceholder("0")
    expect(snippetValue).toContain("replicas = ${2:0}");
    // bool field: appendPlaceholder("False")
    expect(snippetValue).toContain("enabled = ${3:False}");
    // PascalCase type: appendPlaceholder("TypeName()")
    expect(snippetValue).toContain("metadata = ${4:ObjectMeta()}");
    // unknown/empty type: appendPlaceholder("None")
    expect(snippetValue).toContain("labels = ${5:None}");
  });

  it("each field on its own line with 4-space indentation and trailing comma", () => {
    const index = createMockSchemaIndex(schemas);
    const provider = new MissingFieldQuickFixProvider(index);
    const doc = createMockDocument("Account()\n");

    const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 7));
    const diag1 = createDiagnostic(range, 'Missing required field "name" in Account()', "missing-field", "functionStarlark");
    const diag2 = createDiagnostic(range, 'Missing required field "location" in Account()', "missing-field", "functionStarlark");

    const context = {
      diagnostics: [diag1, diag2],
      triggerKind: 1,
      only: undefined,
    } as unknown as vscode.CodeActionContext;

    const actions = provider.provideCodeActions(doc, range, context);
    const edit = actions[0].edit as vscode.WorkspaceEdit;
    const setEdits = (edit as unknown as { setEdits: Array<[unknown, unknown[]]> }).setEdits;
    const snippetEdit = setEdits[0][1][0] as { snippet: { value: string } };
    const snippetValue = snippetEdit.snippet.value;

    // Each field line: \n    fieldName = value,
    // The escaped \n in SnippetString.appendText would be literal \n
    expect(snippetValue).toContain("\\n    name = ");
    expect(snippetValue).toContain("\\n    location = ");
    // Trailing commas
    expect(snippetValue).toMatch(/name = \\"[^"]*\\",/);
    expect(snippetValue).toMatch(/location = \\"[^"]*\\",/);
    // Final newline for closing paren alignment
    expect(snippetValue).toMatch(/,\\n$/);
  });

  it("empty constructor Account() -- no leading comma needed", () => {
    const index = createMockSchemaIndex(schemas);
    const provider = new MissingFieldQuickFixProvider(index);
    const doc = createMockDocument("Account()\n");

    const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 7));
    const diag1 = createDiagnostic(range, 'Missing required field "name" in Account()', "missing-field", "functionStarlark");

    const context = {
      diagnostics: [diag1],
      triggerKind: 1,
      only: undefined,
    } as unknown as vscode.CodeActionContext;

    const actions = provider.provideCodeActions(doc, range, context);
    const edit = actions[0].edit as vscode.WorkspaceEdit;
    const setEdits = (edit as unknown as { setEdits: Array<[unknown, unknown[]]> }).setEdits;
    const snippetEdit = setEdits[0][1][0] as { snippet: { value: string } };
    const snippetValue = snippetEdit.snippet.value;

    // No leading comma
    expect(snippetValue).not.toMatch(/^,/);
    expect(snippetValue).toMatch(/^\\n/);
  });

  it('constructor with existing args Account(name="x") -- adds comma if last arg has no trailing comma', () => {
    const index = createMockSchemaIndex(schemas);
    const provider = new MissingFieldQuickFixProvider(index);
    const doc = createMockDocument('Account(name="x")\n');

    const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 7));
    const diag1 = createDiagnostic(range, 'Missing required field "location" in Account()', "missing-field", "functionStarlark");

    const context = {
      diagnostics: [diag1],
      triggerKind: 1,
      only: undefined,
    } as unknown as vscode.CodeActionContext;

    const actions = provider.provideCodeActions(doc, range, context);
    const edit = actions[0].edit as vscode.WorkspaceEdit;
    const setEdits = (edit as unknown as { setEdits: Array<[unknown, unknown[]]> }).setEdits;
    const snippetEdit = setEdits[0][1][0] as { snippet: { value: string } };
    const snippetValue = snippetEdit.snippet.value;

    // Leading comma before first field
    expect(snippetValue).toMatch(/^,/);
  });

  it('constructor with trailing comma Account(name="x",) -- no extra comma added', () => {
    const index = createMockSchemaIndex(schemas);
    const provider = new MissingFieldQuickFixProvider(index);
    const doc = createMockDocument('Account(name="x",)\n');

    const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 7));
    const diag1 = createDiagnostic(range, 'Missing required field "location" in Account()', "missing-field", "functionStarlark");

    const context = {
      diagnostics: [diag1],
      triggerKind: 1,
      only: undefined,
    } as unknown as vscode.CodeActionContext;

    const actions = provider.provideCodeActions(doc, range, context);
    const edit = actions[0].edit as vscode.WorkspaceEdit;
    const setEdits = (edit as unknown as { setEdits: Array<[unknown, unknown[]]> }).setEdits;
    const snippetEdit = setEdits[0][1][0] as { snippet: { value: string } };
    const snippetValue = snippetEdit.snippet.value;

    // No leading comma -- trailing comma already present
    expect(snippetValue).not.toMatch(/^,/);
  });

  it("action isPreferred is true", () => {
    const index = createMockSchemaIndex(schemas);
    const provider = new MissingFieldQuickFixProvider(index);
    const doc = createMockDocument("Account()\n");

    const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 7));
    const diag1 = createDiagnostic(range, 'Missing required field "name" in Account()', "missing-field", "functionStarlark");

    const context = {
      diagnostics: [diag1],
      triggerKind: 1,
      only: undefined,
    } as unknown as vscode.CodeActionContext;

    const actions = provider.provideCodeActions(doc, range, context);
    expect(actions[0].isPreferred).toBe(true);
  });

  it("action diagnostics array contains the grouped diagnostics", () => {
    const index = createMockSchemaIndex(schemas);
    const provider = new MissingFieldQuickFixProvider(index);
    const doc = createMockDocument("Account()\n");

    const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 7));
    const diag1 = createDiagnostic(range, 'Missing required field "name" in Account()', "missing-field", "functionStarlark");
    const diag2 = createDiagnostic(range, 'Missing required field "location" in Account()', "missing-field", "functionStarlark");

    const context = {
      diagnostics: [diag1, diag2],
      triggerKind: 1,
      only: undefined,
    } as unknown as vscode.CodeActionContext;

    const actions = provider.provideCodeActions(doc, range, context);
    expect(actions[0].diagnostics).toEqual([diag1, diag2]);
  });
});
