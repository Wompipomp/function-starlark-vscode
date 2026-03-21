/**
 * Missing-import diagnostics and quick-fix code actions for schema symbols.
 *
 * Detects PascalCase function calls that match cached schema symbols but are
 * not imported via load(), then offers quick-fix code actions to add the
 * appropriate load() statement.
 */

import * as vscode from "vscode";
import { ociRefToCacheKey, parseLoadStatements } from "./load-parser";
import { BUILTIN_NAMES, SchemaIndex } from "./schema-index";

/** Diagnostic source identifier for this provider. */
const DIAGNOSTIC_SOURCE = "functionStarlark";

/**
 * Provides missing-import diagnostics and quick-fix code actions.
 *
 * Analyzes document text for PascalCase function calls that match known
 * schema symbols but are not imported. Offers quick-fix code actions to
 * insert the appropriate load() statement.
 */
export class MissingImportDiagnosticProvider implements vscode.CodeActionProvider {
  private readonly schemaIndex: SchemaIndex;
  private readonly diagnosticCollection: vscode.DiagnosticCollection;

  constructor(
    schemaIndex: SchemaIndex,
    diagnosticCollection: vscode.DiagnosticCollection,
  ) {
    this.schemaIndex = schemaIndex;
    this.diagnosticCollection = diagnosticCollection;
  }

  /**
   * Analyze document text and update diagnostics for unimported schema symbols.
   */
  updateDiagnostics(document: vscode.TextDocument): void {
    const text = document.getText();
    const loadStatements = parseLoadStatements(text);

    // Build set of imported symbols and namespace bindings
    const importedSymbols = new Set<string>();
    const namespaceSymbols = new Map<string, Set<string>>();
    for (const stmt of loadStatements) {
      const fullCachePath = ociRefToCacheKey(stmt.ociRef) + "/" + stmt.tarEntryPath;

      if (stmt.symbols.includes("*")) {
        const fileSymbols = this.schemaIndex.getSymbolsForFile(fullCachePath);
        for (const sym of fileSymbols) {
          importedSymbols.add(sym);
        }
      } else {
        for (const sym of stmt.symbols) {
          importedSymbols.add(sym);
        }
      }

      // Namespace imports: k8s="*"
      for (const ns of stmt.namespaces) {
        if (ns.value === "*") {
          const fileSymbols = this.schemaIndex.getSymbolsForFile(fullCachePath);
          const existing = namespaceSymbols.get(ns.name) ?? new Set<string>();
          for (const sym of fileSymbols) {
            existing.add(sym);
          }
          namespaceSymbols.set(ns.name, existing);
        }
      }
    }

    // Union with builtins -- these should never be flagged
    const knownSymbols = new Set<string>([...importedSymbols, ...BUILTIN_NAMES]);

    // Get all schema symbols from the index
    const allSchemaSymbols = this.schemaIndex.getAllSymbols();

    // Scan for PascalCase function calls — both bare and namespace-qualified
    const callRe = /\b(?:(\w+)\.)?([A-Z]\w*)\s*\(/g;
    const diagnostics: vscode.Diagnostic[] = [];
    const seen = new Set<string>();

    let match: RegExpExecArray | null;
    while ((match = callRe.exec(text)) !== null) {
      const nsPrefix = match[1]; // undefined for bare calls, "k8s" for k8s.Deployment(
      const symbolName = match[2];
      const fullMatch = nsPrefix ? `${nsPrefix}.${symbolName}` : symbolName;

      if (nsPrefix) {
        // Namespace-qualified: k8s.Deployment( — check if namespace has the symbol
        const nsSyms = namespaceSymbols.get(nsPrefix);
        if (nsSyms?.has(symbolName)) continue;
        // If namespace exists but symbol isn't in it, or namespace doesn't exist, skip
        // (we only flag bare symbols, not namespace misuses)
        continue;
      }

      // Bare symbol: skip if imported, builtin, or not in schema index
      if (knownSymbols.has(symbolName)) continue;
      if (!allSchemaSymbols.has(symbolName)) continue;

      // Only report each symbol once
      if (seen.has(fullMatch)) continue;
      seen.add(fullMatch);

      const pos = document.positionAt(match.index);
      const range = new vscode.Range(
        pos,
        new vscode.Position(pos.line, pos.character + fullMatch.length),
      );

      const diag = new vscode.Diagnostic(
        range,
        `Symbol "${symbolName}" is not imported. Add a load() statement.`,
        vscode.DiagnosticSeverity.Hint,
      );
      diag.source = DIAGNOSTIC_SOURCE;
      diagnostics.push(diag);
    }

    this.diagnosticCollection.set(document.uri, diagnostics);
  }

  /**
   * Provide quick-fix code actions for missing-import diagnostics.
   */
  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    for (const diag of context.diagnostics) {
      if (diag.source !== DIAGNOSTIC_SOURCE) continue;

      // Extract symbol name from diagnostic message
      const nameMatch = diag.message.match(/Symbol "(\w+)"/);
      if (!nameMatch) continue;
      const symbolName = nameMatch[1];

      // Find which file exports this symbol
      const filePath = this.schemaIndex.getFileForSymbol(symbolName);
      if (!filePath) continue;

      // Build the OCI load path from the file path
      // filePath is like "schemas-k8s/v1.31/apps/v1.star"
      // We need to convert to "schemas-k8s:v1.31/apps/v1.star"
      const loadPath = filePathToLoadPath(filePath);

      const action = new vscode.CodeAction(
        `Add load() for "${symbolName}"`,
        vscode.CodeActionKind.QuickFix,
      );

      const edit = new vscode.WorkspaceEdit();
      const insertPosition = findLoadInsertPosition(document.getText());
      edit.insert(
        document.uri,
        insertPosition,
        `load("${loadPath}", "${symbolName}")\n`,
      );

      action.edit = edit;
      action.diagnostics = [diag];
      actions.push(action);
    }

    return actions;
  }

  /**
   * Clean up the diagnostic collection.
   */
  dispose(): void {
    this.diagnosticCollection.clear();
  }
}

/**
 * Convert a cache-relative file path to an OCI load path.
 *
 * Cache paths look like "schemas-k8s/v1.31/apps/v1.star".
 * Load paths look like "schemas-k8s:v1.31/apps/v1.star".
 *
 * The first two path segments (name/tag) are joined with a colon,
 * and the rest is the tar entry path.
 */
function filePathToLoadPath(filePath: string): string {
  const parts = filePath.split("/");
  if (parts.length < 3) return filePath;

  const name = parts[0];
  const tag = parts[1];
  const rest = parts.slice(2).join("/");
  return `${name}:${tag}/${rest}`;
}

/**
 * Find the position where a new load() statement should be inserted.
 *
 * Returns the position after the last existing load() statement,
 * or line 0 character 0 if there are no existing loads.
 */
function findLoadInsertPosition(text: string): vscode.Position {
  const lines = text.split("\n");
  let lastLoadLine = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trimStart().startsWith("load(")) {
      lastLoadLine = i;
    }
  }

  if (lastLoadLine >= 0) {
    return new vscode.Position(lastLoadLine + 1, 0);
  }

  return new vscode.Position(0, 0);
}
