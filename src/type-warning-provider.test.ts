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
    buildFromCache: vi.fn(),
    rebuild: vi.fn(),
  } as unknown as SchemaIndex;
}

function createMockDocument(uri: string, text: string): vscode.TextDocument {
  return {
    uri: { toString: () => uri },
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
});
