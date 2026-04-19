import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hover, MarkdownString, Position, Range } from "vscode";
import {
  getAllowedSymbols,
  createScopingMiddleware,
  updateDocumentImports,
  clearDocumentImports,
  clearAllDocumentImports,
} from "./middleware";
import type { SchemaIndex } from "./schema-index";
import { BUILTIN_NAMES, BUILTIN_MODULE_NAMES, BUILTIN_MODULE_CHILDREN, type BuiltinFuncDoc } from "./schema-index";

// Mock the load-parser module — keep ociRefToCacheKey real, only mock parseLoadStatements
vi.mock("./load-parser", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./load-parser")>();
  return {
    ...actual,
    parseLoadStatements: vi.fn(),
  };
});

import { parseLoadStatements } from "./load-parser";
const mockedParseLoadStatements = vi.mocked(parseLoadStatements);

function createMockSchemaIndex(
  files: Record<string, Set<string>>,
): SchemaIndex {
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
    buildFromCache: vi.fn(),
    rebuild: vi.fn(),
    getSchemaMetadata: () => undefined,
  } as unknown as SchemaIndex;
}

function createMockDocument(
  uri: string,
  text: string,
  wordAtPosition?: string,
) {
  return {
    uri: { toString: () => uri },
    getText: vi.fn((range?: unknown) => {
      if (range && wordAtPosition) {
        return wordAtPosition;
      }
      return text;
    }),
    getWordRangeAtPosition: vi.fn((pos: unknown) => {
      if (wordAtPosition) {
        const p = pos as { line: number; character: number };
        const line = text.split("\n")[p.line] ?? "";
        const idx = line.lastIndexOf(wordAtPosition, p.character);
        const start = idx >= 0 ? idx : 0;
        return new Range(new Position(p.line, start), new Position(p.line, start + wordAtPosition.length));
      }
      return undefined;
    }),
  };
}

describe("getAllowedSymbols", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Clear internal caches between tests
    clearDocumentImports("test://file.star");
    clearDocumentImports("test://other.star");
  });

  it("returns only BUILTIN_NAMES when file has no OCI load statements", () => {
    mockedParseLoadStatements.mockReturnValue([]);
    const index = createMockSchemaIndex({});

    const allowed = getAllowedSymbols(
      "test://file.star",
      "# no loads\n",
      index,
    );

    expect(allowed).toEqual(BUILTIN_NAMES);
  });

  it("returns BUILTIN_NAMES + named imports for file with specific load() imports", () => {
    mockedParseLoadStatements.mockReturnValue([
      {
        ociRef: "schemas-k8s:v1.31",
        tarEntryPath: "apps/v1.star",
        symbols: ["Deployment", "StatefulSet"],
        fullPath: "schemas-k8s:v1.31/apps/v1.star",
        namespaces: [],
      },
    ]);
    const index = createMockSchemaIndex({
      "schemas-k8s/v1.31/apps/v1.star": new Set(["Deployment", "StatefulSet", "ReplicaSet"]),
    });

    const allowed = getAllowedSymbols(
      "test://file.star",
      'load("schemas-k8s:v1.31/apps/v1.star", "Deployment", "StatefulSet")\n',
      index,
    );

    // Should contain all builtins plus the two named imports
    expect(allowed.has("Deployment")).toBe(true);
    expect(allowed.has("StatefulSet")).toBe(true);
    // ReplicaSet not imported, should not be allowed
    expect(allowed.has("ReplicaSet")).toBe(false);
    // Builtins always present
    for (const b of BUILTIN_NAMES) {
      expect(allowed.has(b), `missing builtin: ${b}`).toBe(true);
    }
  });

  it('with star import ("*") returns BUILTIN_NAMES + all symbols from that file', () => {
    mockedParseLoadStatements.mockReturnValue([
      {
        ociRef: "schemas-k8s:v1.31",
        tarEntryPath: "apps/v1.star",
        symbols: ["*"],
        fullPath: "schemas-k8s:v1.31/apps/v1.star",
        namespaces: [],
      },
    ]);
    const index = createMockSchemaIndex({
      "schemas-k8s/v1.31/apps/v1.star": new Set(["Deployment", "StatefulSet", "ReplicaSet"]),
    });

    const allowed = getAllowedSymbols(
      "test://file.star",
      'load("schemas-k8s:v1.31/apps/v1.star", "*")\n',
      index,
    );

    expect(allowed.has("Deployment")).toBe(true);
    expect(allowed.has("StatefulSet")).toBe(true);
    expect(allowed.has("ReplicaSet")).toBe(true);
  });

  it("resolves star import with full registry path to correct cache key", () => {
    mockedParseLoadStatements.mockReturnValue([
      {
        ociRef: "ghcr.io/wompipomp/schemas-k8s:v1.35",
        tarEntryPath: "apps/v1.star",
        symbols: ["*"],
        fullPath: "ghcr.io/wompipomp/schemas-k8s:v1.35/apps/v1.star",
        namespaces: [],
      },
    ]);
    const index = createMockSchemaIndex({
      "schemas-k8s/v1.35/apps/v1.star": new Set(["Deployment", "StatefulSet"]),
    });

    const allowed = getAllowedSymbols(
      "test://file.star",
      'load("ghcr.io/wompipomp/schemas-k8s:v1.35/apps/v1.star", "*")\n',
      index,
    );

    expect(allowed.has("Deployment")).toBe(true);
    expect(allowed.has("StatefulSet")).toBe(true);
  });

  it("with namespace import k8s=\"*\" allows the namespace variable name", () => {
    mockedParseLoadStatements.mockReturnValue([
      {
        ociRef: "schemas-k8s:v1.31",
        tarEntryPath: "apps/v1.star",
        symbols: [],
        namespaces: [{ name: "k8s", value: "*" }],
        fullPath: "schemas-k8s:v1.31/apps/v1.star",
      },
    ]);
    const index = createMockSchemaIndex({
      "schemas-k8s/v1.31/apps/v1.star": new Set(["Deployment", "StatefulSet"]),
    });

    const allowed = getAllowedSymbols(
      "test://file.star",
      'load("schemas-k8s:v1.31/apps/v1.star", k8s="*")\n',
      index,
    );

    // Namespace variable should be allowed
    expect(allowed.has("k8s")).toBe(true);
    // Bare symbols should NOT be allowed (only via k8s.Deployment)
    expect(allowed.has("Deployment")).toBe(false);
  });

  it("caches result per document URI (not re-parsed on every request)", () => {
    mockedParseLoadStatements.mockReturnValue([]);
    const index = createMockSchemaIndex({});

    // First call
    getAllowedSymbols("test://file.star", "# no loads", index);
    // Second call with same URI
    getAllowedSymbols("test://file.star", "# no loads", index);

    // parseLoadStatements should only be called once due to caching
    expect(mockedParseLoadStatements).toHaveBeenCalledTimes(1);
  });
});

describe("updateDocumentImports", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    clearDocumentImports("test://file.star");
  });

  it("refreshes the cached load() parse for a document", () => {
    const index = createMockSchemaIndex({
      "schemas-k8s/v1.31/apps/v1.star": new Set(["Deployment"]),
    });

    // Initial parse
    mockedParseLoadStatements.mockReturnValue([
      {
        ociRef: "schemas-k8s:v1.31",
        tarEntryPath: "apps/v1.star",
        symbols: ["Deployment"],
        fullPath: "schemas-k8s:v1.31/apps/v1.star",
        namespaces: [],
      },
    ]);
    getAllowedSymbols("test://file.star", "initial", index);
    expect(mockedParseLoadStatements).toHaveBeenCalledTimes(1);

    // Update imports -- should re-parse
    mockedParseLoadStatements.mockReturnValue([]);
    updateDocumentImports("test://file.star", "updated", index);

    // Now getAllowedSymbols should use the updated cache
    const allowed = getAllowedSymbols("test://file.star", "updated", index);
    expect(allowed.has("Deployment")).toBe(false);
    // parseLoadStatements called for initial + updateDocumentImports = 2 times
    expect(mockedParseLoadStatements).toHaveBeenCalledTimes(2);
  });
});

describe("createScopingMiddleware", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    clearDocumentImports("test://file.star");
  });

  describe("provideCompletionItem", () => {
    it("filters CompletionItem[] to only allowed symbols", async () => {
      mockedParseLoadStatements.mockReturnValue([
        {
          ociRef: "schemas-k8s:v1.31",
          tarEntryPath: "apps/v1.star",
          symbols: ["Deployment"],
          namespaces: [],
          fullPath: "schemas-k8s:v1.31/apps/v1.star",
        },
      ]);
      const index = createMockSchemaIndex({
        "schemas-k8s/v1.31/apps/v1.star": new Set(["Deployment", "StatefulSet"]),
      });
      const doc = createMockDocument(
        "test://file.star",
        'load("schemas-k8s:v1.31/apps/v1.star", "Deployment")\n',
      );

      const items = [
        { label: "Deployment" },
        { label: "StatefulSet" },
        { label: "Resource" }, // builtin
        { label: "UnknownThing" },
      ];

      const next = vi.fn().mockResolvedValue(items);
      const middleware = createScopingMiddleware(index, () => undefined);

      const result = await middleware.provideCompletionItem(
        doc as never,
        new Position(1, 0) as never,
        {} as never,
        {} as never,
        next,
      );

      expect(Array.isArray(result)).toBe(true);
      const labels = (result as Array<{ label: string }>).map((i) => i.label);
      expect(labels).toContain("Deployment");
      expect(labels).toContain("Resource");
      expect(labels).not.toContain("StatefulSet");
      expect(labels).not.toContain("UnknownThing");
    });

    it("filters CompletionList.items and preserves isIncomplete flag", async () => {
      mockedParseLoadStatements.mockReturnValue([]);
      const index = createMockSchemaIndex({});
      const doc = createMockDocument("test://file.star", "# empty\n");

      const completionList = {
        isIncomplete: true,
        items: [
          { label: "Resource" },
          { label: "Deployment" },
        ],
      };

      const next = vi.fn().mockResolvedValue(completionList);
      const middleware = createScopingMiddleware(index, () => undefined);

      const result = await middleware.provideCompletionItem(
        doc as never,
        new Position(0, 0) as never,
        {} as never,
        {} as never,
        next,
      );

      expect(Array.isArray(result)).toBe(false);
      const list = result as { isIncomplete: boolean; items: Array<{ label: string }> };
      expect(list.isIncomplete).toBe(true);
      // Only Resource is a builtin; Deployment is not imported
      const labels = list.items.map((i) => i.label);
      expect(labels).toContain("Resource");
      expect(labels).not.toContain("Deployment");
    });

    it("passes null/undefined results through unchanged", async () => {
      mockedParseLoadStatements.mockReturnValue([]);
      const index = createMockSchemaIndex({});
      const doc = createMockDocument("test://file.star", "# empty\n");

      const next = vi.fn().mockResolvedValue(null);
      const middleware = createScopingMiddleware(index, () => undefined);

      const result = await middleware.provideCompletionItem(
        doc as never,
        new Position(0, 0) as never,
        {} as never,
        {} as never,
        next,
      );

      expect(result).toBeNull();
    });

    it("handles CompletionItem.label as CompletionItemLabel object", async () => {
      mockedParseLoadStatements.mockReturnValue([]);
      const index = createMockSchemaIndex({});
      const doc = createMockDocument("test://file.star", "# empty\n");

      const items = [
        { label: { label: "Resource", description: "builtin" } },
        { label: { label: "Unknown", description: "something" } },
      ];

      const next = vi.fn().mockResolvedValue(items);
      const middleware = createScopingMiddleware(index, () => undefined);

      const result = await middleware.provideCompletionItem(
        doc as never,
        new Position(0, 0) as never,
        {} as never,
        {} as never,
        next,
      );

      expect(Array.isArray(result)).toBe(true);
      const labels = (result as Array<{ label: { label: string } }>).map(
        (i) => i.label.label,
      );
      expect(labels).toContain("Resource");
      expect(labels).not.toContain("Unknown");
    });

    it("replaces LSP results with module children when completing after a builtin module (e.g., crypto.)", async () => {
      mockedParseLoadStatements.mockReturnValue([]);
      const index = createMockSchemaIndex({});
      const text = 'crypto.\n';
      const doc = createMockDocument("test://file.star", text);

      // LSP returns top-level symbols, not crypto's children
      const items = [
        { label: "Resource" },
        { label: "get" },
        { label: "schema" },
      ];

      const next = vi.fn().mockResolvedValue(items);
      const middleware = createScopingMiddleware(index, () => undefined);

      // Position cursor at line 0, character 7 (right after "crypto.")
      const result = await middleware.provideCompletionItem(
        doc as never,
        new Position(0, 7) as never,
        {} as never,
        {} as never,
        next,
      );

      expect(Array.isArray(result)).toBe(true);
      const labels = (result as Array<{ label: string }>).map((i) => i.label);
      // Should contain all crypto module children
      const expectedChildren = BUILTIN_MODULE_CHILDREN.get("crypto")!;
      for (const child of expectedChildren) {
        expect(labels, `missing crypto child: ${child}`).toContain(child);
      }
      // Should NOT contain top-level builtins
      expect(labels).not.toContain("Resource");
      expect(labels).not.toContain("get");
      expect(labels).not.toContain("schema");
    });

    it("still filters bare module child names not after a module dot (e.g., sha256 alone)", async () => {
      mockedParseLoadStatements.mockReturnValue([]);
      const index = createMockSchemaIndex({});
      const text = 'sha256\n';
      const doc = createMockDocument("test://file.star", text);

      const items = [
        { label: "sha256" },
        { label: "Resource" },
      ];

      const next = vi.fn().mockResolvedValue(items);
      const middleware = createScopingMiddleware(index, () => undefined);

      const result = await middleware.provideCompletionItem(
        doc as never,
        new Position(0, 6) as never,
        {} as never,
        {} as never,
        next,
      );

      expect(Array.isArray(result)).toBe(true);
      const labels = (result as Array<{ label: string }>).map((i) => i.label);
      expect(labels).not.toContain("sha256");
      expect(labels).toContain("Resource");
    });

    it("still allows OCI namespace dot-completion (regression check)", async () => {
      mockedParseLoadStatements.mockReturnValue([
        {
          ociRef: "schemas-k8s:v1.31",
          tarEntryPath: "apps/v1.star",
          symbols: [],
          namespaces: [{ name: "k8s", value: "*" }],
          fullPath: "schemas-k8s:v1.31/apps/v1.star",
        },
      ]);
      const index = createMockSchemaIndex({
        "schemas-k8s/v1.31/apps/v1.star": new Set(["Deployment", "StatefulSet"]),
      });
      const text = 'load("schemas-k8s:v1.31/apps/v1.star", k8s="*")\nk8s.\n';
      const doc = createMockDocument("test://file.star", text);

      const items = [
        { label: "Deployment" },
        { label: "StatefulSet" },
      ];

      const next = vi.fn().mockResolvedValue(items);
      const middleware = createScopingMiddleware(index, () => undefined);

      // Position: line 1, character 4 (after "k8s.")
      const result = await middleware.provideCompletionItem(
        doc as never,
        new Position(1, 4) as never,
        {} as never,
        {} as never,
        next,
      );

      expect(Array.isArray(result)).toBe(true);
      const labels = (result as Array<{ label: string }>).map((i) => i.label);
      expect(labels).toContain("Deployment");
      expect(labels).toContain("StatefulSet");
    });

    it("uses getDocumentText when available", async () => {
      const text = 'load("schemas-k8s:v1.31/apps/v1.star", "Deployment")\n';
      mockedParseLoadStatements.mockReturnValue([
        {
          ociRef: "schemas-k8s:v1.31",
          tarEntryPath: "apps/v1.star",
          symbols: ["Deployment"],
          namespaces: [],
          fullPath: "schemas-k8s:v1.31/apps/v1.star",
        },
      ]);
      const index = createMockSchemaIndex({
        "schemas-k8s/v1.31/apps/v1.star": new Set(["Deployment"]),
      });
      const doc = createMockDocument("test://file.star", "stale text");

      const items = [{ label: "Deployment" }];
      const next = vi.fn().mockResolvedValue(items);
      const getDocumentText = vi.fn().mockReturnValue(text);

      const middleware = createScopingMiddleware(index, getDocumentText);

      await middleware.provideCompletionItem(
        doc as never,
        new Position(0, 0) as never,
        {} as never,
        {} as never,
        next,
      );

      expect(getDocumentText).toHaveBeenCalledWith("test://file.star");
    });
  });

  describe("provideHover", () => {
    it("returns the hover when word is in allowed symbols", async () => {
      mockedParseLoadStatements.mockReturnValue([
        {
          ociRef: "schemas-k8s:v1.31",
          tarEntryPath: "apps/v1.star",
          symbols: ["Deployment"],
          namespaces: [],
          fullPath: "schemas-k8s:v1.31/apps/v1.star",
        },
      ]);
      const index = createMockSchemaIndex({
        "schemas-k8s/v1.31/apps/v1.star": new Set(["Deployment"]),
      });
      const doc = createMockDocument(
        "test://file.star",
        'load("schemas-k8s:v1.31/apps/v1.star", "Deployment")\n',
        "Deployment",
      );

      const hoverResult = { contents: "Deployment docs" };
      const next = vi.fn().mockResolvedValue(hoverResult);
      const middleware = createScopingMiddleware(index, () => undefined);

      const result = await middleware.provideHover(
        doc as never,
        new Position(1, 0) as never,
        {} as never,
        next,
      );

      expect(result).toEqual(hoverResult);
    });

    it("returns undefined when word is NOT in allowed symbols (suppressed)", async () => {
      mockedParseLoadStatements.mockReturnValue([]);
      const index = createMockSchemaIndex({});
      const doc = createMockDocument(
        "test://file.star",
        "# empty\n",
        "StatefulSet",
      );

      const hoverResult = { contents: "StatefulSet docs" };
      const next = vi.fn().mockResolvedValue(hoverResult);
      const middleware = createScopingMiddleware(index, () => undefined);

      const result = await middleware.provideHover(
        doc as never,
        new Position(0, 0) as never,
        {} as never,
        next,
      );

      expect(result).toBeUndefined();
    });

    it("passes LSP hover through for user-namespace members (k8s.Deployment when k8s=\"*\")", async () => {
      mockedParseLoadStatements.mockReturnValue([
        {
          ociRef: "schemas-k8s:v1.35",
          tarEntryPath: "apps/v1.star",
          symbols: [],
          namespaces: [{ name: "k8s", value: "*" }],
          fullPath: "schemas-k8s:v1.35/apps/v1.star",
        },
      ]);
      const index = createMockSchemaIndex({
        "schemas-k8s/v1.35/apps/v1.star": new Set(["Deployment", "StatefulSet"]),
      });
      const text =
        'load("schemas-k8s:v1.35/apps/v1.star", k8s="*")\nd = k8s.Deployment(spec=x)\n';
      const doc = createMockDocument("test://file.star", text, "Deployment");

      const hoverResult = { contents: "Deployment docs from stub" };
      const next = vi.fn().mockResolvedValue(hoverResult);
      const middleware = createScopingMiddleware(index, () => undefined);

      // position within the Deployment identifier on the usage line
      const line = text.split("\n").findIndex((l) => l.includes("k8s.Deployment"));
      const char = text.split("\n")[line].indexOf("Deployment") + 2;
      const result = await middleware.provideHover(
        doc as never,
        new Position(line, char) as never,
        {} as never,
        next,
      );

      expect(result).toEqual(hoverResult);
    });

    it("still suppresses user-namespace hover when the prefix is unknown (foo.Deployment with k8s=\"*\")", async () => {
      mockedParseLoadStatements.mockReturnValue([
        {
          ociRef: "schemas-k8s:v1.35",
          tarEntryPath: "apps/v1.star",
          symbols: [],
          namespaces: [{ name: "k8s", value: "*" }],
          fullPath: "schemas-k8s:v1.35/apps/v1.star",
        },
      ]);
      const index = createMockSchemaIndex({
        "schemas-k8s/v1.35/apps/v1.star": new Set(["Deployment"]),
      });
      const text =
        'load("schemas-k8s:v1.35/apps/v1.star", k8s="*")\nd = foo.Deployment(spec=x)\n';
      const doc = createMockDocument("test://other.star", text, "Deployment");

      const hoverResult = { contents: "some lsp hover" };
      const next = vi.fn().mockResolvedValue(hoverResult);
      const middleware = createScopingMiddleware(index, () => undefined);

      const line = text.split("\n").findIndex((l) => l.includes("foo.Deployment"));
      const char = text.split("\n")[line].indexOf("Deployment") + 2;
      const result = await middleware.provideHover(
        doc as never,
        new Position(line, char) as never,
        {} as never,
        next,
      );

      expect(result).toBeUndefined();
    });

    it("constructs hover from stub docs when LSP returns null for module child (e.g., crypto.sha256)", async () => {
      mockedParseLoadStatements.mockReturnValue([]);
      const index = createMockSchemaIndex({});
      const text = 'crypto.sha256(data)\n';
      const doc = createMockDocument("test://file.star", text, "sha256");

      const moduleDocs = new Map<string, Map<string, BuiltinFuncDoc>>([
        ["crypto", new Map([
          ["sha256", { signature: "sha256(data)", docstring: "Compute SHA-256 hash of data." }],
        ])],
      ]);

      // LSP returns null — doesn't know about module children
      const next = vi.fn().mockResolvedValue(null);
      const middleware = createScopingMiddleware(index, () => undefined, moduleDocs);

      const result = await middleware.provideHover(
        doc as never,
        new Position(0, 13) as never,
        {} as never,
        next,
      );

      expect(result).toBeDefined();
      expect(result).toBeInstanceOf(Hover);
      const hover = result as InstanceType<typeof Hover>;
      const md = hover.contents[0] as InstanceType<typeof MarkdownString>;
      expect(md.value).toContain("crypto.sha256(data)");
      expect(md.value).toContain("Compute SHA-256 hash of data.");
    });

    it("constructs hover from stub docs when LSP returns null for encoding.b64enc", async () => {
      mockedParseLoadStatements.mockReturnValue([]);
      const index = createMockSchemaIndex({});
      const text = 'encoding.b64enc(data)\n';
      const doc = createMockDocument("test://file.star", text, "b64enc");

      const moduleDocs = new Map<string, Map<string, BuiltinFuncDoc>>([
        ["encoding", new Map([
          ["b64enc", { signature: "b64enc(data)", docstring: "Encode data to standard Base64." }],
        ])],
      ]);

      const next = vi.fn().mockResolvedValue(null);
      const middleware = createScopingMiddleware(index, () => undefined, moduleDocs);

      const result = await middleware.provideHover(
        doc as never,
        new Position(0, 15) as never,
        {} as never,
        next,
      );

      expect(result).toBeDefined();
      expect(result).toBeInstanceOf(Hover);
      const hover = result as InstanceType<typeof Hover>;
      const md = hover.contents[0] as InstanceType<typeof MarkdownString>;
      expect(md.value).toContain("encoding.b64enc(data)");
      expect(md.value).toContain("Encode data to standard Base64.");
    });

    it("still returns hover for flat builtins like Resource (regression check)", async () => {
      mockedParseLoadStatements.mockReturnValue([]);
      const index = createMockSchemaIndex({});
      const text = 'Resource("my-resource", body)\n';
      const doc = createMockDocument("test://file.star", text, "Resource");

      const hoverResult = { contents: "Resource docs" };
      const next = vi.fn().mockResolvedValue(hoverResult);
      const middleware = createScopingMiddleware(index, () => undefined);

      const result = await middleware.provideHover(
        doc as never,
        new Position(0, 4) as never,
        {} as never,
        next,
      );

      expect(result).toEqual(hoverResult);
    });

    it("still returns hover for OCI imported symbols like Deployment (regression check)", async () => {
      mockedParseLoadStatements.mockReturnValue([
        {
          ociRef: "schemas-k8s:v1.31",
          tarEntryPath: "apps/v1.star",
          symbols: ["Deployment"],
          namespaces: [],
          fullPath: "schemas-k8s:v1.31/apps/v1.star",
        },
      ]);
      const index = createMockSchemaIndex({
        "schemas-k8s/v1.31/apps/v1.star": new Set(["Deployment"]),
      });
      const text = 'load("schemas-k8s:v1.31/apps/v1.star", "Deployment")\nDeployment()\n';
      const doc = createMockDocument("test://file.star", text, "Deployment");

      const hoverResult = { contents: "Deployment docs" };
      const next = vi.fn().mockResolvedValue(hoverResult);
      const middleware = createScopingMiddleware(index, () => undefined);

      const result = await middleware.provideHover(
        doc as never,
        new Position(1, 5) as never,
        {} as never,
        next,
      );

      expect(result).toEqual(hoverResult);
    });

    it("returns hover for field parameter name in constructor call (keyword arg context)", async () => {
      mockedParseLoadStatements.mockReturnValue([
        {
          ociRef: "schemas-k8s:v1.31",
          tarEntryPath: "core/v1.star",
          symbols: ["PVC"],
          namespaces: [],
          fullPath: "schemas-k8s:v1.31/core/v1.star",
        },
      ]);
      const index = createMockSchemaIndex({
        "schemas-k8s/v1.31/core/v1.star": new Set(["PVC"]),
      });
      const text = 'load("schemas-k8s:v1.31/core/v1.star", "PVC")\nPVC(accessMode="RWO")\n';
      const doc = createMockDocument("test://file.star", text, "accessMode");

      const hoverResult = { contents: "accessMode docs" };
      const next = vi.fn().mockResolvedValue(hoverResult);
      const middleware = createScopingMiddleware(index, () => undefined);

      const result = await middleware.provideHover(
        doc as never,
        new Position(1, 6) as never,
        {} as never,
        next,
      );

      expect(result).toEqual(hoverResult);
    });

    it("returns hover for keyword arg after comma in constructor call", async () => {
      mockedParseLoadStatements.mockReturnValue([
        {
          ociRef: "schemas-k8s:v1.31",
          tarEntryPath: "core/v1.star",
          symbols: ["PVC"],
          namespaces: [],
          fullPath: "schemas-k8s:v1.31/core/v1.star",
        },
      ]);
      const index = createMockSchemaIndex({
        "schemas-k8s/v1.31/core/v1.star": new Set(["PVC"]),
      });
      const text = 'PVC(accessMode="RWO", storageClass="gp3")\n';
      const doc = createMockDocument("test://file.star", text, "storageClass");

      const hoverResult = { contents: "storageClass docs" };
      const next = vi.fn().mockResolvedValue(hoverResult);
      const middleware = createScopingMiddleware(index, () => undefined);

      const result = await middleware.provideHover(
        doc as never,
        new Position(0, 25) as never,
        {} as never,
        next,
      );

      expect(result).toEqual(hoverResult);
    });

    it("returns hover for keyword arg in multi-line constructor call", async () => {
      mockedParseLoadStatements.mockReturnValue([
        {
          ociRef: "schemas-k8s:v1.31",
          tarEntryPath: "core/v1.star",
          symbols: ["PVC"],
          namespaces: [],
          fullPath: "schemas-k8s:v1.31/core/v1.star",
        },
      ]);
      const index = createMockSchemaIndex({
        "schemas-k8s/v1.31/core/v1.star": new Set(["PVC"]),
      });
      const text = 'PVC(\n  accessMode="RWO",\n)\n';
      const doc = createMockDocument("test://file.star", text, "accessMode");

      const hoverResult = { contents: "accessMode docs" };
      const next = vi.fn().mockResolvedValue(hoverResult);
      const middleware = createScopingMiddleware(index, () => undefined);

      const result = await middleware.provideHover(
        doc as never,
        new Position(1, 4) as never,
        {} as never,
        next,
      );

      expect(result).toEqual(hoverResult);
    });

    it("returns hover for keyword arg in namespace-qualified call", async () => {
      mockedParseLoadStatements.mockReturnValue([
        {
          ociRef: "schemas-k8s:v1.31",
          tarEntryPath: "core/v1.star",
          symbols: [],
          namespaces: [{ name: "k8s", value: "*" }],
          fullPath: "schemas-k8s:v1.31/core/v1.star",
        },
      ]);
      const index = createMockSchemaIndex({
        "schemas-k8s/v1.31/core/v1.star": new Set(["PVC"]),
      });
      const text = 'k8s.PVC(accessMode="RWO")\n';
      const doc = createMockDocument("test://file.star", text, "accessMode");

      const hoverResult = { contents: "accessMode docs" };
      const next = vi.fn().mockResolvedValue(hoverResult);
      const middleware = createScopingMiddleware(index, () => undefined);

      const result = await middleware.provideHover(
        doc as never,
        new Position(0, 10) as never,
        {} as never,
        next,
      );

      expect(result).toEqual(hoverResult);
    });

    it("returns falsy value when LSP returns null for keyword arg position (no crash)", async () => {
      mockedParseLoadStatements.mockReturnValue([]);
      const index = createMockSchemaIndex({});
      const text = 'PVC(accessMode="RWO")\n';
      const doc = createMockDocument("test://file.star", text, "accessMode");

      const next = vi.fn().mockResolvedValue(null);
      const middleware = createScopingMiddleware(index, () => undefined);

      const result = await middleware.provideHover(
        doc as never,
        new Position(0, 6) as never,
        {} as never,
        next,
      );

      expect(result).toBeFalsy();
    });

    it("still suppresses hover for unknown symbols not in any module", async () => {
      mockedParseLoadStatements.mockReturnValue([]);
      const index = createMockSchemaIndex({});
      const text = 'unknownFunc()\n';
      const doc = createMockDocument("test://file.star", text, "unknownFunc");

      const hoverResult = { contents: "unknownFunc docs" };
      const next = vi.fn().mockResolvedValue(hoverResult);
      const middleware = createScopingMiddleware(index, () => undefined);

      const result = await middleware.provideHover(
        doc as never,
        new Position(0, 5) as never,
        {} as never,
        next,
      );

      expect(result).toBeUndefined();
    });

    it("returns undefined when LSP returns null and no word at position", async () => {
      mockedParseLoadStatements.mockReturnValue([]);
      const index = createMockSchemaIndex({});
      const doc = createMockDocument("test://file.star", "# empty\n");

      const next = vi.fn().mockResolvedValue(null);
      const middleware = createScopingMiddleware(index, () => undefined);

      const result = await middleware.provideHover(
        doc as never,
        new Position(0, 0) as never,
        {} as never,
        next,
      );

      expect(result).toBeUndefined();
    });
  });

  describe("provideSignatureHelp", () => {
    it("passes through unfiltered", async () => {
      const sigHelp = {
        signatures: [{ label: "Resource(name, body)" }],
        activeSignature: 0,
        activeParameter: 0,
      };
      const next = vi.fn().mockResolvedValue(sigHelp);
      const index = createMockSchemaIndex({});
      const doc = createMockDocument("test://file.star", "# empty\n");
      const middleware = createScopingMiddleware(index, () => undefined);

      const result = await middleware.provideSignatureHelp(
        doc as never,
        new Position(0, 0) as never,
        {} as never,
        {} as never,
        next,
      );

      expect(result).toEqual(sigHelp);
      expect(next).toHaveBeenCalled();
    });
  });
});

describe("clearAllDocumentImports", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    clearDocumentImports("test://file1.star");
    clearDocumentImports("test://file2.star");
  });

  it("clears the entire documentImportsCache so subsequent calls recompute", () => {
    const index = createMockSchemaIndex({
      "schemas-k8s/v1.31/apps/v1.star": new Set(["Deployment"]),
    });

    // Populate cache for two URIs
    mockedParseLoadStatements.mockReturnValue([
      {
        ociRef: "schemas-k8s:v1.31",
        tarEntryPath: "apps/v1.star",
        symbols: ["Deployment"],
        namespaces: [],
        fullPath: "schemas-k8s:v1.31/apps/v1.star",
      },
    ]);
    updateDocumentImports("test://file1.star", "load stmt 1", index);
    updateDocumentImports("test://file2.star", "load stmt 2", index);

    // Both should have Deployment
    expect(getAllowedSymbols("test://file1.star", "load stmt 1", index).has("Deployment")).toBe(true);
    expect(getAllowedSymbols("test://file2.star", "load stmt 2", index).has("Deployment")).toBe(true);

    // Clear all caches
    clearAllDocumentImports();

    // Now mock returns no load statements (simulating cache cleared for disabled schemas)
    mockedParseLoadStatements.mockReturnValue([]);

    // Cache miss forces recompute with no loads -> only builtins
    const allowed1 = getAllowedSymbols("test://file1.star", "# no loads", index);
    const allowed2 = getAllowedSymbols("test://file2.star", "# no loads", index);
    expect(allowed1.has("Deployment")).toBe(false);
    expect(allowed2.has("Deployment")).toBe(false);

    // Should only contain builtins
    expect(allowed1).toEqual(BUILTIN_NAMES);
    expect(allowed2).toEqual(BUILTIN_NAMES);
  });
});
