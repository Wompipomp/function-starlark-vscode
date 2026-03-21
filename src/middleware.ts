/**
 * LanguageClient middleware for per-file completion/hover/signatureHelp filtering.
 *
 * Scopes IntelliSense results to only builtins + symbols explicitly imported
 * via load() statements in the current file.
 */

import { ociRefToCacheKey, parseLoadStatements } from "./load-parser";
import { BUILTIN_NAMES, SchemaIndex } from "./schema-index";

/** Cache of allowed symbols per document URI. */
const documentImportsCache = new Map<string, Set<string>>();

/**
 * Compute the set of symbols allowed in the given document.
 *
 * Always includes BUILTIN_NAMES. Adds named imports from load() statements
 * that reference OCI artifacts. Star imports ("*") expand to all symbols
 * from the referenced .star file.
 *
 * Results are cached per document URI. Use updateDocumentImports() to
 * refresh the cache after edits.
 */
export function getAllowedSymbols(
  documentUri: string,
  documentText: string,
  schemaIndex: SchemaIndex,
): Set<string> {
  const cached = documentImportsCache.get(documentUri);
  if (cached) {
    return cached;
  }

  const allowed = new Set<string>(BUILTIN_NAMES);
  const loadStatements = parseLoadStatements(documentText);

  for (const stmt of loadStatements) {
    if (stmt.symbols.includes("*")) {
      // Star import: add all symbols from the referenced file
      const fullCachePath = ociRefToCacheKey(stmt.ociRef) + "/" + stmt.tarEntryPath;
      const fileSymbols = schemaIndex.getSymbolsForFile(fullCachePath);
      for (const sym of fileSymbols) {
        allowed.add(sym);
      }
    } else {
      // Named imports: add each symbol
      for (const sym of stmt.symbols) {
        allowed.add(sym);
      }
    }
  }

  documentImportsCache.set(documentUri, allowed);
  return allowed;
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
      const allowed = getAllowedSymbols(uri, text, schemaIndex);

      const isArray = Array.isArray(result);
      const items = isArray
        ? (result as Array<{ label: string | { label: string } }>)
        : (result as { items: Array<{ label: string | { label: string } }> }).items;

      const filtered = items.filter((item) =>
        allowed.has(getCompletionLabel(item.label)),
      );

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
      const allowed = getAllowedSymbols(uri, text, schemaIndex);

      return allowed.has(word) ? hover : undefined;
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
