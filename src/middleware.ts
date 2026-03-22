/**
 * LanguageClient middleware for per-file completion/hover/signatureHelp filtering.
 *
 * Scopes IntelliSense results to only builtins + symbols explicitly imported
 * via load() statements in the current file.
 */

import { ociRefToCacheKey, parseLoadStatements } from "./load-parser";
import { BUILTIN_NAMES, SchemaIndex } from "./schema-index";

/** Cached import data per document URI. */
interface DocumentImports {
  /** Flat allowed symbols (builtins + direct imports + star imports) */
  allowed: Set<string>;
  /** Namespace → set of symbols accessible via ns.Symbol */
  namespaces: Map<string, Set<string>>;
}

const documentImportsCache = new Map<string, DocumentImports>();

/**
 * Compute the allowed symbols and namespace bindings for a document.
 *
 * Always includes BUILTIN_NAMES in flat symbols. Adds named imports from
 * load() statements. Star imports ("*") expand to all symbols from the
 * referenced file. Namespace imports (k8s="*") create namespace bindings.
 */
export function getDocumentImports(
  documentUri: string,
  documentText: string,
  schemaIndex: SchemaIndex,
): DocumentImports {
  const cached = documentImportsCache.get(documentUri);
  if (cached) {
    return cached;
  }

  const allowed = new Set<string>(BUILTIN_NAMES);
  const namespaces = new Map<string, Set<string>>();
  const loadStatements = parseLoadStatements(documentText);

  for (const stmt of loadStatements) {
    const fullCachePath = ociRefToCacheKey(stmt.ociRef) + "/" + stmt.tarEntryPath;

    // Handle direct symbol imports
    if (stmt.symbols.includes("*")) {
      const fileSymbols = schemaIndex.getSymbolsForFile(fullCachePath);
      for (const sym of fileSymbols) {
        allowed.add(sym);
      }
    } else {
      for (const sym of stmt.symbols) {
        allowed.add(sym);
      }
    }

    // Handle namespace imports: k8s="*"
    for (const ns of stmt.namespaces) {
      if (ns.value === "*") {
        const fileSymbols = schemaIndex.getSymbolsForFile(fullCachePath);
        // Allow the namespace variable name itself
        allowed.add(ns.name);
        // Track which symbols are in this namespace
        const existing = namespaces.get(ns.name) ?? new Set<string>();
        for (const sym of fileSymbols) {
          existing.add(sym);
        }
        namespaces.set(ns.name, existing);
      }
    }
  }

  const result = { allowed, namespaces };
  documentImportsCache.set(documentUri, result);
  return result;
}

/** Backward-compatible wrapper — returns just the flat allowed set. */
export function getAllowedSymbols(
  documentUri: string,
  documentText: string,
  schemaIndex: SchemaIndex,
): Set<string> {
  return getDocumentImports(documentUri, documentText, schemaIndex).allowed;
}

/**
 * Refresh the cached load() parse for a document.
 * Call this when the document text changes.
 */
export function updateDocumentImports(
  uri: string,
  text: string,
  schemaIndex: SchemaIndex,
): void {
  documentImportsCache.delete(uri);
  getAllowedSymbols(uri, text, schemaIndex);
}

/**
 * Remove a document from the imports cache.
 * Call this when a document is closed.
 */
export function clearDocumentImports(uri: string): void {
  documentImportsCache.delete(uri);
}

/**
 * Clear the entire document imports cache.
 * Call this when the schema subsystem is torn down to prevent stale data.
 */
export function clearAllDocumentImports(): void {
  documentImportsCache.clear();
}

/** Extract the label string from a CompletionItem label (string or CompletionItemLabel). */
function getCompletionLabel(label: string | { label: string }): string {
  return typeof label === "string" ? label : label.label;
}

/**
 * Create LanguageClient middleware hooks that scope completions, hover,
 * and signature help per-file based on load() imports.
 *
 * @param schemaIndex - The schema symbol index
 * @param getDocumentText - Optional function to get document text by URI
 *   (e.g., from an open TextDocument). Falls back to document.getText().
 */
export function createScopingMiddleware(
  schemaIndex: SchemaIndex,
  getDocumentText: (uri: string) => string | undefined,
) {
  return {
    provideCompletionItem: async (
      document: { uri: { toString(): string }; getText(): string },
      position: unknown,
      context: unknown,
      token: unknown,
      next: (...args: unknown[]) => Promise<unknown>,
    ) => {
      const result = await next(document, position, context, token);
      if (!result) {
        return result;
      }

      const uri = document.uri.toString();
      const text = getDocumentText(uri) ?? document.getText();
      const imports = getDocumentImports(uri, text, schemaIndex);

      // Detect namespace dot-completion context: check if we're completing
      // after "ns." where ns is a known namespace. starlark-lsp returns
      // bare labels (e.g., "Deployment") for dot completions, not "ns.Deployment".
      const pos = position as { line: number; character: number };
      const lineText = text.split("\n")[pos.line] ?? "";
      const beforeCursor = lineText.substring(0, pos.character);
      const nsDotMatch = beforeCursor.match(/(\w+)\.\w*$/);
      const activeNamespace = nsDotMatch ? imports.namespaces.get(nsDotMatch[1]) : undefined;

      const isArray = Array.isArray(result);
      const items = isArray
        ? (result as Array<{ label: string | { label: string } }>)
        : (result as { items: Array<{ label: string | { label: string } }> }).items;

      const filtered = items.filter((item) => {
        const label = getCompletionLabel(item.label);
        // If completing after a known namespace (e.g., "k8s."), allow its members
        if (activeNamespace?.has(label)) return true;
        // Allow flat symbols (builtins + direct imports)
        if (imports.allowed.has(label)) return true;
        return false;
      });

      return isArray
        ? filtered
        : { ...(result as object), items: filtered };
    },

    provideHover: async (
      document: {
        uri: { toString(): string };
        getText(range?: unknown): string;
        getWordRangeAtPosition(position: unknown): unknown | undefined;
      },
      position: unknown,
      token: unknown,
      next: (...args: unknown[]) => Promise<unknown>,
    ) => {
      const hover = await next(document, position, token);
      if (!hover) {
        return hover;
      }

      const wordRange = document.getWordRangeAtPosition(position);
      if (!wordRange) {
        return hover;
      }

      const word = document.getText(wordRange);
      const uri = document.uri.toString();
      const text = getDocumentText(uri) ?? document.getText();
      const imports = getDocumentImports(uri, text, schemaIndex);

      if (imports.allowed.has(word)) return hover;
      // Check namespace membership for hover on namespace variable
      if (imports.namespaces.has(word)) return hover;
      return undefined;
    },

    provideSignatureHelp: async (
      document: unknown,
      position: unknown,
      context: unknown,
      token: unknown,
      next: (...args: unknown[]) => Promise<unknown>,
    ) => {
      return next(document, position, context, token);
    },
  };
}
