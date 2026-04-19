/**
 * LanguageClient middleware for per-file completion/hover/signatureHelp filtering.
 *
 * Scopes IntelliSense results to only builtins + symbols explicitly imported
 * via load() statements in the current file.
 */

import { Hover, MarkdownString } from "vscode";
import { ociRefToCacheKey, parseLoadStatements } from "./load-parser";
import { BUILTIN_NAMES, BUILTIN_MODULE_NAMES, BUILTIN_MODULE_CHILDREN, type BuiltinFuncDoc, SchemaIndex } from "./schema-index";
import { parseSchemas } from "./schema-stubs";

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

/**
 * Detect whether the cursor is on a keyword-argument name inside a function
 * call, e.g., `PVC(accessMode=...)` or a multi-line variant.
 *
 * Returns true when the word at the cursor is likely a parameter name in a
 * function/constructor call context — meaning it should not be suppressed
 * by the hover middleware even though it is not in the allowed symbols set.
 */
function isInKeywordArgContext(
  beforeWord: string,
  fullText: string,
  currentLine: number,
): boolean {
  // Single-line: word is right after "Func(" or "ns.Func("
  // e.g., beforeWord = "PVC(" or "k8s.PVC("
  if (/\w\s*\(\s*$/.test(beforeWord)) return true;

  // Single-line: word is after a comma (second+ kwarg on same line)
  // e.g., beforeWord = 'PVC(accessMode="RWO", '
  if (/,\s*$/.test(beforeWord)) return true;

  // Multi-line: beforeWord is whitespace-only (indented kwarg on its own line).
  // Scan upward to find an unclosed open-paren belonging to a call.
  if (/^\s*$/.test(beforeWord)) {
    const lines = fullText.split("\n");
    let depth = 0;
    for (let i = currentLine - 1; i >= 0 && i >= currentLine - 20; i--) {
      const line = lines[i];
      for (let j = line.length - 1; j >= 0; j--) {
        if (line[j] === ")") depth++;
        else if (line[j] === "(") {
          depth--;
          if (depth < 0) {
            // Found an unclosed open paren — check if preceded by a word (function call)
            const before = line.substring(0, j);
            if (/\w\s*$/.test(before)) return true;
            return false;
          }
        }
      }
    }
  }

  return false;
}

/**
 * Find the constructor name for the enclosing function call at the cursor.
 * E.g., for beforeWord="PVC(" returns "PVC"; for multi-line, scans upward.
 */
function findEnclosingConstructor(
  beforeWord: string,
  fullText: string,
  currentLine: number,
): string | undefined {
  // Single-line: "PVC(" or "ns.PVC("
  const singleLine = beforeWord.match(/(\w+)\s*\(\s*$/);
  if (singleLine) return singleLine[1];

  // After comma: "PVC(x="a", " — scan back on same line for the call
  const commaLine = beforeWord.match(/(\w+)\s*\(/);
  if (commaLine) return commaLine[1];

  // Multi-line: scan upward
  if (/^\s*$/.test(beforeWord)) {
    const lines = fullText.split("\n");
    let depth = 0;
    for (let i = currentLine - 1; i >= 0 && i >= currentLine - 20; i--) {
      const line = lines[i];
      for (let j = line.length - 1; j >= 0; j--) {
        if (line[j] === ")") depth++;
        else if (line[j] === "(") {
          depth--;
          if (depth < 0) {
            const before = line.substring(0, j);
            const m = before.match(/(\w+)\s*$/);
            return m ? m[1] : undefined;
          }
        }
      }
    }
  }
  return undefined;
}

/**
 * Build hover content for a field parameter from schema metadata.
 * Checks both the SchemaIndex (cached schemas) and locally-defined schemas.
 */
function buildFieldHover(
  fieldName: string,
  beforeWord: string,
  fullText: string,
  currentLine: number,
  schemaIdx: SchemaIndex,
): Hover | undefined {
  const ctorName = findEnclosingConstructor(beforeWord, fullText, currentLine);
  if (!ctorName) return undefined;

  // Check cached schemas first, then local
  let schema = schemaIdx.getSchemaMetadata(ctorName);
  if (!schema) {
    const localSchemas = parseSchemas(fullText);
    schema = localSchemas.find(s => s.name === ctorName);
  }
  if (!schema) return undefined;

  const field = schema.fields.find(f => f.name === fieldName);
  if (!field) return undefined;

  const md = new MarkdownString();
  const typePart = field.type ? `: ${field.type}` : "";
  const reqPart = field.required ? " (required)" : "";
  md.appendCodeblock(`${fieldName}${typePart}${reqPart}`, "python");

  const parts: string[] = [];
  if (field.doc) parts.push(field.doc);
  if (field.enum.length > 0) {
    parts.push(`Allowed: ${field.enum.map(v => `\`"${v}"\``).join(", ")}`);
  }
  if (parts.length > 0) {
    md.appendMarkdown("---\n" + parts.join(parts[0]?.endsWith(".") ? " " : ". "));
  }

  return new Hover(md);
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
  builtinModuleDocs?: Map<string, Map<string, BuiltinFuncDoc>>,
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
      const isBuiltinModule = nsDotMatch ? BUILTIN_MODULE_NAMES.has(nsDotMatch[1]) : false;

      const isArray = Array.isArray(result);
      const items = isArray
        ? (result as Array<{ label: string | { label: string } }>)
        : (result as { items: Array<{ label: string | { label: string } }> }).items;

      // For builtin modules, the LSP doesn't return module-specific children —
      // it returns top-level symbols. We replace results with the actual children.
      const activeModuleChildren = nsDotMatch && isBuiltinModule
        ? BUILTIN_MODULE_CHILDREN.get(nsDotMatch[1])
        : undefined;

      if (activeModuleChildren) {
        const moduleItems = [...activeModuleChildren].map((name) => ({ label: name }));
        return isArray
          ? moduleItems
          : { ...(result as object), items: moduleItems };
      }

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

      const wordRange = document.getWordRangeAtPosition(position);
      if (!wordRange) {
        return hover ?? undefined;
      }

      const word = document.getText(wordRange);
      const uri = document.uri.toString();
      const text = getDocumentText(uri) ?? document.getText();
      const imports = getDocumentImports(uri, text, schemaIndex);

      const pos = position as { line: number; character: number };
      const lineText = text.split("\n")[pos.line] ?? "";
      const wordStart = (wordRange as { start: { character: number } }).start.character;
      const beforeWord = lineText.substring(0, wordStart);


      // Allow hover for symbols the user has imported or are builtins
      if (hover && imports.allowed.has(word)) return hover;
      if (hover && imports.namespaces.has(word)) return hover;

      // Detect "module.word" pattern.
      const moduleMatch = beforeWord.match(/(\w+)\.$/);

      // User-defined namespace import (e.g. `k8s="*"`): pass the LSP hover
      // through when the word is a member of that namespace. Without this,
      // the fall-through `return hover ? undefined : hover` at the bottom
      // would silently drop every `k8s.Deployment`-style hover even though
      // starlark-lsp has the right stub.
      if (
        hover &&
        moduleMatch &&
        imports.namespaces.get(moduleMatch[1])?.has(word)
      ) {
        return hover;
      }

      // Detect "module.word" pattern for builtin module children
      if (moduleMatch && BUILTIN_MODULE_NAMES.has(moduleMatch[1])) {
        // LSP returned hover — pass it through
        if (hover) return hover;
        // LSP returned null — construct hover from stub docs
        const moduleName = moduleMatch[1];
        const funcDoc = builtinModuleDocs?.get(moduleName)?.get(word);
        if (funcDoc) {
          const md = new MarkdownString();
          md.appendCodeblock(`${moduleName}.${funcDoc.signature}`, "python");
          md.appendMarkdown(`---\n${funcDoc.docstring}`);
          return new Hover(md);
        }
      }

      // Detect keyword-argument context: word is a parameter name inside a
      // constructor/function call, e.g., PVC(accessMode=...) or PVC(\n  accessMode=...)
      const isKeywordArg = isInKeywordArgContext(beforeWord, text, pos.line);
      if (isKeywordArg) {
        if (hover) return hover;
        // LSP returned null — construct hover from schema metadata
        // (local schemas have no LSP stubs)
        const fieldHover = buildFieldHover(word, beforeWord, text, pos.line, schemaIndex);
        if (fieldHover) return fieldHover;
      }

      // Suppress hover for symbols that aren't allowed
      return hover ? undefined : hover;
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
