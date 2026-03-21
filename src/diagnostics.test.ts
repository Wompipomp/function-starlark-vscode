import { describe, it, expect, vi, beforeEach } from "vitest";
import * as vscode from "vscode";
import { MissingImportDiagnosticProvider } from "./diagnostics";
import type { SchemaIndex } from "./schema-index";

// Mock the load-parser module
vi.mock("./load-parser", () => ({
  parseLoadStatements: vi.fn(),
}));

import { parseLoadStatements } from "./load-parser";
const mockedParseLoadStatements = vi.mocked(parseLoadStatements);

function createMockSchemaIndex(
  files: Record<string, Set<string>>,
): SchemaIndex {
  // Build reverse mapping: symbol -> file path
  const reverseMap = new Map<string, string>();
  for (const [filePath, symbols] of Object.entries(files)) {
    for (const sym of symbols) {
      reverseMap.set(sym, filePath);
    }
  }

  return {
    getSymbolsForFile: (path: string) => files[path] ?? new Set(),
    getAllSymbols: () => {
      const all = new Set<string>();
      for (const symbols of Object.values(files)) {
        for (const s of symbols) {
          all.add(s);
        }
      }
      return all;
    },
    getFileForSymbol: (symbol: string) => reverseMap.get(symbol),
    buildFromCache: vi.fn(),
    rebuild: vi.fn(),
  } as unknown as SchemaIndex;
}

function createMockDocument(uri: string, text: string) {
  const lines = text.split("\n");
  return {
    uri: { toString: () => uri },
    getText: () => text,
    languageId: "starlark",
    positionAt: (offset: number) => {
      let line = 0;
      let remaining = offset;
      for (let i = 0; i < lines.length; i++) {
        // +1 for the newline character
        const lineLen = lines[i].length + 1;
        if (remaining < lineLen) {
          return new vscode.Position(line, remaining);
        }
        remaining -= lineLen;
        line++;
      }
      return new vscode.Position(line, remaining);
    },
  } as unknown as vscode.TextDocument;
}

function createMockDiagnosticCollection() {
  return {
    set: vi.fn(),
    delete: vi.fn(),
    clear: vi.fn(),
    dispose: vi.fn(),
  } as unknown as vscode.DiagnosticCollection;
}

describe("MissingImportDiagnosticProvider", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("updateDiagnostics", () => {
    it("creates diagnostics for unimported schema symbols used in the document", () => {
      mockedParseLoadStatements.mockReturnValue([]);
      const index = createMockSchemaIndex({
        "schemas-k8s/v1.31/apps/v1.star": new Set(["Deployment", "StatefulSet"]),
      });
      const diagCollection = createMockDiagnosticCollection();
      const provider = new MissingImportDiagnosticProvider(index, diagCollection);

      const doc = createMockDocument(
        "test://file.star",
        'res = Deployment("my-deploy")\n',
      );
      provider.updateDiagnostics(doc);

      expect(diagCollection.set).toHaveBeenCalledTimes(1);
      const [uri, diagnostics] = (diagCollection.set as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(uri.toString()).toBe("test://file.star");
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toContain("Deployment");
      expect(diagnostics[0].message).toContain("not imported");
      expect(diagnostics[0].severity).toBe(vscode.DiagnosticSeverity.Hint);
    });

    it("does not flag symbols that are already imported via load()", () => {
      mockedParseLoadStatements.mockReturnValue([
        {
          ociRef: "schemas-k8s:v1.31",
          tarEntryPath: "apps/v1.star",
          symbols: ["Deployment"],
          fullPath: "schemas-k8s:v1.31/apps/v1.star",
        },
      ]);
      const index = createMockSchemaIndex({
        "schemas-k8s/v1.31/apps/v1.star": new Set(["Deployment"]),
      });
      const diagCollection = createMockDiagnosticCollection();
      const provider = new MissingImportDiagnosticProvider(index, diagCollection);

      const doc = createMockDocument(
        "test://file.star",
        'load("schemas-k8s:v1.31/apps/v1.star", "Deployment")\nres = Deployment("my-deploy")\n',
      );
      provider.updateDiagnostics(doc);

      const [, diagnostics] = (diagCollection.set as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(diagnostics).toHaveLength(0);
    });

    it("does not flag builtin names as missing imports", () => {
      mockedParseLoadStatements.mockReturnValue([]);
      const index = createMockSchemaIndex({});
      const diagCollection = createMockDiagnosticCollection();
      const provider = new MissingImportDiagnosticProvider(index, diagCollection);

      // Resource is a builtin, not a schema symbol
      const doc = createMockDocument(
        "test://file.star",
        'res = Resource("my-resource")\n',
      );
      provider.updateDiagnostics(doc);

      const [, diagnostics] = (diagCollection.set as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(diagnostics).toHaveLength(0);
    });

    it("does not flag unknown symbols (not in schema index)", () => {
      mockedParseLoadStatements.mockReturnValue([]);
      const index = createMockSchemaIndex({});
      const diagCollection = createMockDiagnosticCollection();
      const provider = new MissingImportDiagnosticProvider(index, diagCollection);

      const doc = createMockDocument(
        "test://file.star",
        'res = MyCustomThing("hello")\n',
      );
      provider.updateDiagnostics(doc);

      const [, diagnostics] = (diagCollection.set as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(diagnostics).toHaveLength(0);
    });

    it("returns empty diagnostics when no schema symbols are used", () => {
      mockedParseLoadStatements.mockReturnValue([]);
      const index = createMockSchemaIndex({
        "schemas-k8s/v1.31/apps/v1.star": new Set(["Deployment"]),
      });
      const diagCollection = createMockDiagnosticCollection();
      const provider = new MissingImportDiagnosticProvider(index, diagCollection);

      const doc = createMockDocument(
        "test://file.star",
        "x = 42\n",
      );
      provider.updateDiagnostics(doc);

      const [, diagnostics] = (diagCollection.set as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(diagnostics).toHaveLength(0);
    });

    it("does not flag symbols that are star-imported via load(\"...\", \"*\")", () => {
      mockedParseLoadStatements.mockReturnValue([
        {
          ociRef: "schemas-k8s:v1.31",
          tarEntryPath: "apps/v1.star",
          symbols: ["*"],
          fullPath: "schemas-k8s:v1.31/apps/v1.star",
        },
      ]);
      const index = createMockSchemaIndex({
        "schemas-k8s/v1.31/apps/v1.star": new Set(["Deployment", "StatefulSet"]),
      });
      const diagCollection = createMockDiagnosticCollection();
      const provider = new MissingImportDiagnosticProvider(index, diagCollection);

      const doc = createMockDocument(
        "test://file.star",
        'load("schemas-k8s:v1.31/apps/v1.star", "*")\nres = Deployment("x")\nb = StatefulSet("y")\n',
      );
      provider.updateDiagnostics(doc);

      const [, diagnostics] = (diagCollection.set as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(diagnostics).toHaveLength(0);
    });

    it("detects multiple unimported symbols", () => {
      mockedParseLoadStatements.mockReturnValue([]);
      const index = createMockSchemaIndex({
        "schemas-k8s/v1.31/apps/v1.star": new Set(["Deployment", "StatefulSet"]),
      });
      const diagCollection = createMockDiagnosticCollection();
      const provider = new MissingImportDiagnosticProvider(index, diagCollection);

      const doc = createMockDocument(
        "test://file.star",
        'a = Deployment("x")\nb = StatefulSet("y")\n',
      );
      provider.updateDiagnostics(doc);

      const [, diagnostics] = (diagCollection.set as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(diagnostics).toHaveLength(2);
    });
  });

  describe("provideCodeActions", () => {
    it("creates a quick-fix code action to insert load() for missing import", () => {
      mockedParseLoadStatements.mockReturnValue([]);
      const index = createMockSchemaIndex({
        "schemas-k8s/v1.31/apps/v1.star": new Set(["Deployment"]),
      });
      const diagCollection = createMockDiagnosticCollection();
      const provider = new MissingImportDiagnosticProvider(index, diagCollection);

      // First generate diagnostics
      const doc = createMockDocument(
        "test://file.star",
        'res = Deployment("my-deploy")\n',
      );
      provider.updateDiagnostics(doc);

      const [, diagnostics] = (diagCollection.set as ReturnType<typeof vi.fn>).mock.calls[0];

      // Now ask for code actions for those diagnostics
      const actions = provider.provideCodeActions(
        doc,
        new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 10)),
        { diagnostics, only: undefined, triggerKind: 1 } as unknown as vscode.CodeActionContext,
      );

      expect(actions).toHaveLength(1);
      expect(actions[0].title).toContain("Deployment");
      expect(actions[0].kind).toBe(vscode.CodeActionKind.QuickFix);
      expect(actions[0].edit).toBeInstanceOf(vscode.WorkspaceEdit);
    });

    it("inserts load() after last existing load statement", () => {
      mockedParseLoadStatements.mockReturnValue([
        {
          ociRef: "schemas-k8s:v1.31",
          tarEntryPath: "core/v1.star",
          symbols: ["Service"],
          fullPath: "schemas-k8s:v1.31/core/v1.star",
        },
      ]);
      const index = createMockSchemaIndex({
        "schemas-k8s/v1.31/apps/v1.star": new Set(["Deployment"]),
        "schemas-k8s/v1.31/core/v1.star": new Set(["Service"]),
      });
      const diagCollection = createMockDiagnosticCollection();
      const provider = new MissingImportDiagnosticProvider(index, diagCollection);

      const text = 'load("schemas-k8s:v1.31/core/v1.star", "Service")\nres = Deployment("my-deploy")\n';
      const doc = createMockDocument("test://file.star", text);
      provider.updateDiagnostics(doc);

      const [, diagnostics] = (diagCollection.set as ReturnType<typeof vi.fn>).mock.calls[0];

      const actions = provider.provideCodeActions(
        doc,
        new vscode.Range(new vscode.Position(1, 0), new vscode.Position(1, 10)),
        { diagnostics, only: undefined, triggerKind: 1 } as unknown as vscode.CodeActionContext,
      );

      expect(actions).toHaveLength(1);
      // The edit should insert after line 0 (the existing load)
      const edit = actions[0].edit as vscode.WorkspaceEdit;
      // Check that the edit inserts at line 1 (after the last load)
      expect((edit as unknown as { edits: Array<{ position: vscode.Position; text: string }> }).edits[0].position.line).toBe(1);
    });

    it("returns empty actions when no diagnostics from this provider", () => {
      const index = createMockSchemaIndex({});
      const diagCollection = createMockDiagnosticCollection();
      const provider = new MissingImportDiagnosticProvider(index, diagCollection);

      const doc = createMockDocument("test://file.star", "x = 42\n");

      const actions = provider.provideCodeActions(
        doc,
        new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 5)),
        { diagnostics: [], only: undefined, triggerKind: 1 } as unknown as vscode.CodeActionContext,
      );

      expect(actions).toHaveLength(0);
    });
  });

  describe("dispose", () => {
    it("clears the diagnostic collection on dispose", () => {
      const index = createMockSchemaIndex({});
      const diagCollection = createMockDiagnosticCollection();
      const provider = new MissingImportDiagnosticProvider(index, diagCollection);

      provider.dispose();

      expect(diagCollection.clear).toHaveBeenCalled();
    });
  });
});
