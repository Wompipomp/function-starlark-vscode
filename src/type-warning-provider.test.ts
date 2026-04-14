import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as vscode from "vscode";
import { TypeWarningProvider } from "./type-warning-provider";
import type { SchemaIndex } from "./schema-index";

// Mock the type-checker module
vi.mock("./type-checker", () => ({
  checkDocument: vi.fn(() => []),
}));

// Mock the middleware module
vi.mock("./middleware", () => ({
  getDocumentImports: vi.fn(() => ({
    allowed: new Set<string>(),
    namespaces: new Map<string, Set<string>>(),
  })),
}));

import { checkDocument } from "./type-checker";
import { getDocumentImports } from "./middleware";
const mockedCheckDocument = vi.mocked(checkDocument);
const mockedGetDocumentImports = vi.mocked(getDocumentImports);

function createMockSchemaIndex(): SchemaIndex {
  return {
    getSchemaMetadata: vi.fn(() => undefined),
    getSymbolsForFile: vi.fn(() => new Set()),
    getAllSymbols: vi.fn(() => new Set()),
    getFileForSymbol: vi.fn(() => undefined),
    getAbsolutePathForSymbol: vi.fn(() => undefined),
    buildFromCache: vi.fn(),
    rebuild: vi.fn(),
  } as unknown as SchemaIndex;
}

function createMockDocument(uri: string, text: string): vscode.TextDocument {
  return {
    uri: { toString: () => uri, fsPath: uri },
    getText: () => text,
    languageId: "starlark",
  } as unknown as vscode.TextDocument;
}

describe("TypeWarningProvider", () => {
  let mockDiagCollection: {
    set: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
    name: string;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
    mockDiagCollection = {
      set: vi.fn(),
      delete: vi.fn(),
      clear: vi.fn(),
      dispose: vi.fn(),
      name: "functionStarlarkTypeWarnings",
    };
    vi.mocked(vscode.languages.createDiagnosticCollection).mockReturnValue(
      mockDiagCollection as unknown as vscode.DiagnosticCollection,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("debounce behavior", () => {
    it("creates DiagnosticCollection named 'functionStarlarkTypeWarnings'", () => {
      const index = createMockSchemaIndex();
      const _provider = new TypeWarningProvider(index);
      expect(vscode.languages.createDiagnosticCollection).toHaveBeenCalledWith(
        "functionStarlarkTypeWarnings",
      );
    });

    it("updateDiagnostics is called immediately (no debounce for direct calls)", () => {
      const index = createMockSchemaIndex();
      const provider = new TypeWarningProvider(index);
      const doc = createMockDocument("test://file.star", "x = 1\n");

      mockedGetDocumentImports.mockReturnValue({
        allowed: new Set<string>(),
        namespaces: new Map<string, Set<string>>(),
      });

      provider.updateDiagnostics(doc);
      expect(mockDiagCollection.set).toHaveBeenCalledTimes(1);
    });

    it("converts DiagnosticDescriptors to vscode.Diagnostic with Warning severity", () => {
      const index = createMockSchemaIndex();
      const provider = new TypeWarningProvider(index);
      const doc = createMockDocument("test://file.star", 'Account(name="x")\n');

      mockedGetDocumentImports.mockReturnValue({
        allowed: new Set<string>(["Account"]),
        namespaces: new Map<string, Set<string>>(),
      });
      mockedCheckDocument.mockReturnValue([
        {
          line: 0,
          startChar: 0,
          endChar: 7,
          message: 'Missing required field "location" in Account()',
          kind: "missing-field" as const,
          schemaName: "Account",
          fieldName: "location",
        },
      ]);

      provider.updateDiagnostics(doc);

      const [uri, diagnostics] = mockDiagCollection.set.mock.calls[0];
      expect(uri.toString()).toBe("test://file.star");
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].severity).toBe(vscode.DiagnosticSeverity.Warning);
      expect(diagnostics[0].source).toBe("functionStarlark");
      expect(diagnostics[0].message).toBe(
        'Missing required field "location" in Account()',
      );
    });

    it("sets diag.code to the descriptor kind value", () => {
      const index = createMockSchemaIndex();
      const provider = new TypeWarningProvider(index);
      const doc = createMockDocument("test://file.star", 'Account(name="x")\n');

      mockedGetDocumentImports.mockReturnValue({
        allowed: new Set<string>(["Account"]),
        namespaces: new Map<string, Set<string>>(),
      });
      mockedCheckDocument.mockReturnValue([
        {
          line: 0,
          startChar: 0,
          endChar: 7,
          message: 'Missing required field "location" in Account()',
          kind: "missing-field" as const,
          schemaName: "Account",
          fieldName: "location",
        },
        {
          line: 0,
          startChar: 8,
          endChar: 14,
          message: 'Field "name" expects int, got string',
          kind: "type-mismatch" as const,
          schemaName: "Account",
          fieldName: "name",
        },
      ]);

      provider.updateDiagnostics(doc);

      const [, diagnostics] = mockDiagCollection.set.mock.calls[0];
      expect(diagnostics[0].code).toBe("missing-field");
      expect(diagnostics[1].code).toBe("type-mismatch");
    });

    it("filters out BUILTIN_NAMES from importedSymbols passed to checkDocument", () => {
      const index = createMockSchemaIndex();
      const provider = new TypeWarningProvider(index);
      const doc = createMockDocument("test://file.star", "Account()\n");

      // getDocumentImports returns allowed set WITH builtins (as it always does)
      mockedGetDocumentImports.mockReturnValue({
        allowed: new Set<string>(["Account", "Resource", "schema", "field"]),
        namespaces: new Map<string, Set<string>>(),
      });

      provider.updateDiagnostics(doc);

      // checkDocument should receive importedSymbols WITHOUT builtins
      const importedSymbols = mockedCheckDocument.mock.calls[0][1];
      expect(importedSymbols.has("Account")).toBe(true);
      expect(importedSymbols.has("Resource")).toBe(false);
      expect(importedSymbols.has("schema")).toBe(false);
      expect(importedSymbols.has("field")).toBe(false);
    });

    it("dispose clears and disposes the DiagnosticCollection", () => {
      const index = createMockSchemaIndex();
      const provider = new TypeWarningProvider(index);

      provider.dispose();

      expect(mockDiagCollection.clear).toHaveBeenCalled();
      expect(mockDiagCollection.dispose).toHaveBeenCalled();
    });
  });

  describe("relatedInformation", () => {
    it("type-mismatch diagnostic gets relatedInformation pointing to field definition line", () => {
      const index = createMockSchemaIndex();
      vi.mocked(index.getSchemaMetadata).mockReturnValue({
        name: "Account",
        doc: "An account",
        nameLine: 0,
        fields: [
          { name: "name", type: "string", required: true, doc: "", enum: [], line: 2 },
          { name: "location", type: "string", required: true, doc: "", enum: [], line: 4 },
        ],
      });
      vi.mocked(index.getAbsolutePathForSymbol).mockReturnValue("/mock/cache/schemas-test/v1/account.star");

      const provider = new TypeWarningProvider(index);
      const doc = createMockDocument("test://file.star", 'Account(name=42)\n');

      mockedGetDocumentImports.mockReturnValue({
        allowed: new Set<string>(["Account"]),
        namespaces: new Map<string, Set<string>>(),
      });
      mockedCheckDocument.mockReturnValue([
        {
          line: 0,
          startChar: 8,
          endChar: 14,
          message: 'Field "name" expects string, got int',
          kind: "type-mismatch" as const,
          schemaName: "Account",
          fieldName: "name",
        },
      ]);

      provider.updateDiagnostics(doc);

      const [, diagnostics] = mockDiagCollection.set.mock.calls[0];
      expect(diagnostics[0].relatedInformation).toHaveLength(1);
      const ri = diagnostics[0].relatedInformation[0];
      expect(ri.location.uri.fsPath).toBe("/mock/cache/schemas-test/v1/account.star");
      expect(ri.location.range.start.line).toBe(2);
      expect(ri.message).toBe("'name' defined here");
    });

    it("missing-field diagnostic gets relatedInformation pointing to missing field definition line", () => {
      const index = createMockSchemaIndex();
      vi.mocked(index.getSchemaMetadata).mockReturnValue({
        name: "Account",
        doc: "An account",
        nameLine: 0,
        fields: [
          { name: "name", type: "string", required: true, doc: "", enum: [], line: 2 },
          { name: "location", type: "string", required: true, doc: "", enum: [], line: 4 },
        ],
      });
      vi.mocked(index.getAbsolutePathForSymbol).mockReturnValue("/mock/cache/schemas-test/v1/account.star");

      const provider = new TypeWarningProvider(index);
      const doc = createMockDocument("test://file.star", 'Account(name="x")\n');

      mockedGetDocumentImports.mockReturnValue({
        allowed: new Set<string>(["Account"]),
        namespaces: new Map<string, Set<string>>(),
      });
      mockedCheckDocument.mockReturnValue([
        {
          line: 0,
          startChar: 0,
          endChar: 7,
          message: 'Missing required field "location" in Account()',
          kind: "missing-field" as const,
          schemaName: "Account",
          fieldName: "location",
        },
      ]);

      provider.updateDiagnostics(doc);

      const [, diagnostics] = mockDiagCollection.set.mock.calls[0];
      expect(diagnostics[0].relatedInformation).toHaveLength(1);
      const ri = diagnostics[0].relatedInformation[0];
      expect(ri.location.uri.fsPath).toBe("/mock/cache/schemas-test/v1/account.star");
      expect(ri.location.range.start.line).toBe(4);
      expect(ri.message).toBe("'location' defined here");
    });

    it("enum-mismatch diagnostic gets relatedInformation pointing to field definition line", () => {
      const index = createMockSchemaIndex();
      vi.mocked(index.getSchemaMetadata).mockReturnValue({
        name: "Account",
        doc: "An account",
        nameLine: 0,
        fields: [
          { name: "tier", type: "string", required: true, doc: "", enum: ["free", "pro"], line: 3 },
        ],
      });
      vi.mocked(index.getAbsolutePathForSymbol).mockReturnValue("/mock/cache/schemas-test/v1/account.star");

      const provider = new TypeWarningProvider(index);
      const doc = createMockDocument("test://file.star", 'Account(tier="invalid")\n');

      mockedGetDocumentImports.mockReturnValue({
        allowed: new Set<string>(["Account"]),
        namespaces: new Map<string, Set<string>>(),
      });
      mockedCheckDocument.mockReturnValue([
        {
          line: 0,
          startChar: 8,
          endChar: 21,
          message: 'Field "tier" must be one of: "free", "pro"',
          kind: "enum-mismatch" as const,
          schemaName: "Account",
          fieldName: "tier",
        },
      ]);

      provider.updateDiagnostics(doc);

      const [, diagnostics] = mockDiagCollection.set.mock.calls[0];
      expect(diagnostics[0].relatedInformation).toHaveLength(1);
      const ri = diagnostics[0].relatedInformation[0];
      expect(ri.location.uri.fsPath).toBe("/mock/cache/schemas-test/v1/account.star");
      expect(ri.location.range.start.line).toBe(3);
      expect(ri.message).toBe("'tier' defined here");
    });

    it("unknown-field diagnostic gets relatedInformation pointing to schema nameLine", () => {
      const index = createMockSchemaIndex();
      vi.mocked(index.getSchemaMetadata).mockReturnValue({
        name: "Account",
        doc: "An account",
        nameLine: 5,
        fields: [
          { name: "name", type: "string", required: true, doc: "", enum: [], line: 7 },
        ],
      });
      vi.mocked(index.getAbsolutePathForSymbol).mockReturnValue("/mock/cache/schemas-test/v1/account.star");

      const provider = new TypeWarningProvider(index);
      const doc = createMockDocument("test://file.star", 'Account(bogus="x")\n');

      mockedGetDocumentImports.mockReturnValue({
        allowed: new Set<string>(["Account"]),
        namespaces: new Map<string, Set<string>>(),
      });
      mockedCheckDocument.mockReturnValue([
        {
          line: 0,
          startChar: 8,
          endChar: 13,
          message: 'Unknown field "bogus" in Account()',
          kind: "unknown-field" as const,
          schemaName: "Account",
          fieldName: undefined,
        },
      ]);

      provider.updateDiagnostics(doc);

      const [, diagnostics] = mockDiagCollection.set.mock.calls[0];
      expect(diagnostics[0].relatedInformation).toHaveLength(1);
      const ri = diagnostics[0].relatedInformation[0];
      expect(ri.location.uri.fsPath).toBe("/mock/cache/schemas-test/v1/account.star");
      expect(ri.location.range.start.line).toBe(5);
      expect(ri.message).toBe("'Account' defined here");
    });

    it("local schema diagnostic uses document URI instead of cache file", () => {
      const index = createMockSchemaIndex();
      // No cache metadata — schema is defined locally in the document
      vi.mocked(index.getSchemaMetadata).mockReturnValue(undefined);
      vi.mocked(index.getFileForSymbol).mockReturnValue(undefined);

      const provider = new TypeWarningProvider(index);
      const localText = [
        'MySchema = schema("MySchema",',
        '  doc="A local schema",',
        '  title=field(type="string", required=True),',
        ")",
        'MySchema(title=42)',
      ].join("\n");
      const doc = createMockDocument("file:///workspace/main.star", localText);

      mockedGetDocumentImports.mockReturnValue({
        allowed: new Set<string>(),
        namespaces: new Map<string, Set<string>>(),
      });
      mockedCheckDocument.mockReturnValue([
        {
          line: 4,
          startChar: 9,
          endChar: 17,
          message: 'Field "title" expects string, got int',
          kind: "type-mismatch" as const,
          schemaName: "MySchema",
          fieldName: "title",
        },
      ]);

      provider.updateDiagnostics(doc);

      const [, diagnostics] = mockDiagCollection.set.mock.calls[0];
      expect(diagnostics[0].relatedInformation).toHaveLength(1);
      const ri = diagnostics[0].relatedInformation[0];
      // Local schema should use the document's own URI, not a cache path
      expect(ri.location.uri.toString()).toBe("file:///workspace/main.star");
      expect(ri.message).toBe("'title' defined here");
    });

    it("no relatedInformation when getAbsolutePathForSymbol returns undefined (no cache file)", () => {
      const index = createMockSchemaIndex();
      vi.mocked(index.getSchemaMetadata).mockReturnValue({
        name: "Account",
        doc: "An account",
        nameLine: 0,
        fields: [
          { name: "name", type: "string", required: true, doc: "", enum: [], line: 2 },
        ],
      });
      // No file available in cache (either unknown symbol or missing on disk)
      vi.mocked(index.getAbsolutePathForSymbol).mockReturnValue(undefined);

      const provider = new TypeWarningProvider(index);
      const doc = createMockDocument("test://file.star", 'Account(name=42)\n');

      mockedGetDocumentImports.mockReturnValue({
        allowed: new Set<string>(["Account"]),
        namespaces: new Map<string, Set<string>>(),
      });
      mockedCheckDocument.mockReturnValue([
        {
          line: 0,
          startChar: 8,
          endChar: 14,
          message: 'Field "name" expects string, got int',
          kind: "type-mismatch" as const,
          schemaName: "Account",
          fieldName: "name",
        },
      ]);

      provider.updateDiagnostics(doc);

      const [, diagnostics] = mockDiagCollection.set.mock.calls[0];
      expect(diagnostics[0].relatedInformation).toBeUndefined();
    });

    it("no relatedInformation when field name is not found in schema metadata (stale cache)", () => {
      const index = createMockSchemaIndex();
      vi.mocked(index.getSchemaMetadata).mockReturnValue({
        name: "Account",
        doc: "An account",
        nameLine: 0,
        fields: [
          { name: "name", type: "string", required: true, doc: "", enum: [], line: 2 },
        ],
      });
      vi.mocked(index.getAbsolutePathForSymbol).mockReturnValue("/mock/cache/schemas-test/v1/account.star");

      const provider = new TypeWarningProvider(index);
      const doc = createMockDocument("test://file.star", 'Account(gone=42)\n');

      mockedGetDocumentImports.mockReturnValue({
        allowed: new Set<string>(["Account"]),
        namespaces: new Map<string, Set<string>>(),
      });
      mockedCheckDocument.mockReturnValue([
        {
          line: 0,
          startChar: 8,
          endChar: 14,
          message: 'Field "gone" expects string, got int',
          kind: "type-mismatch" as const,
          schemaName: "Account",
          fieldName: "gone", // not present in schema.fields above
        },
      ]);

      provider.updateDiagnostics(doc);

      const [, diagnostics] = mockDiagCollection.set.mock.calls[0];
      // Better no relatedInformation than a misleading one pointing at the wrong line
      expect(diagnostics[0].relatedInformation).toBeUndefined();
    });

    it("caches URI resolution per update — multiple diagnostics on same schema hit cache once", () => {
      const index = createMockSchemaIndex();
      vi.mocked(index.getSchemaMetadata).mockReturnValue({
        name: "Account",
        doc: "An account",
        nameLine: 0,
        fields: [
          { name: "name", type: "string", required: true, doc: "", enum: [], line: 2 },
          { name: "email", type: "string", required: true, doc: "", enum: [], line: 3 },
        ],
      });
      const pathMock = vi.mocked(index.getAbsolutePathForSymbol);
      pathMock.mockReturnValue("/mock/cache/schemas-test/v1/account.star");

      const provider = new TypeWarningProvider(index);
      const doc = createMockDocument("test://file.star", 'Account(name=1, email=2)\n');

      mockedGetDocumentImports.mockReturnValue({
        allowed: new Set<string>(["Account"]),
        namespaces: new Map<string, Set<string>>(),
      });
      mockedCheckDocument.mockReturnValue([
        { line: 0, startChar: 13, endChar: 14, message: "…", kind: "type-mismatch" as const, schemaName: "Account", fieldName: "name" },
        { line: 0, startChar: 22, endChar: 23, message: "…", kind: "type-mismatch" as const, schemaName: "Account", fieldName: "email" },
      ]);

      provider.updateDiagnostics(doc);

      expect(pathMock).toHaveBeenCalledTimes(1);
    });
  });
});
