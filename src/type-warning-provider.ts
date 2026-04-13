/**
 * VS Code diagnostic provider for schema type warnings.
 *
 * Thin wrapper around the pure-logic type checker. Owns a separate
 * DiagnosticCollection ("functionStarlarkTypeWarnings") to prevent
 * clobbering with the existing missing-import DiagnosticCollection.
 */

import * as vscode from "vscode";
import { checkDocument } from "./type-checker";
import { getDocumentImports } from "./middleware";
import { BUILTIN_NAMES, type SchemaIndex } from "./schema-index";
import { parseSchemas } from "./schema-stubs";

/** Diagnostic source label — matches existing missing-import diagnostics for Problems panel grouping. */
const DIAGNOSTIC_SOURCE = "functionStarlark";

/**
 * Provides type-checking diagnostics for schema constructor calls.
 *
 * Converts pure-logic DiagnosticDescriptor[] from checkDocument() into
 * vscode.Diagnostic[] with Warning severity. Manages its own
 * DiagnosticCollection lifecycle.
 */
export class TypeWarningProvider implements vscode.Disposable {
  private readonly diagnosticCollection: vscode.DiagnosticCollection;
  private readonly schemaIndex: SchemaIndex;

  constructor(schemaIndex: SchemaIndex) {
    this.schemaIndex = schemaIndex;
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection(
      "functionStarlarkTypeWarnings",
    );
  }

  /**
   * Run type checking on a document and update diagnostics.
   *
   * Gets document imports, filters out builtins (not schema constructors),
   * calls checkDocument, and converts descriptors to vscode.Diagnostic.
   */
  updateDiagnostics(document: vscode.TextDocument): void {
    const text = document.getText();
    const uri = document.uri.toString();
    const imports = getDocumentImports(uri, text, this.schemaIndex);

    // Filter out builtins — checkDocument only checks imported schema constructors
    const importedSymbols = new Set<string>();
    for (const sym of imports.allowed) {
      if (!BUILTIN_NAMES.has(sym)) {
        importedSymbols.add(sym);
      }
    }

    // Parse schemas defined in the current document so type-checking
    // works for locally-defined schemas, not just cached ones.
    const localSchemas = parseSchemas(text);
    const localSchemaMap = new Map(localSchemas.map(s => [s.name, s]));
    for (const s of localSchemas) {
      importedSymbols.add(s.name);
    }

    const descriptors = checkDocument(
      text,
      importedSymbols,
      imports.namespaces,
      (symbolName) => localSchemaMap.get(symbolName) ?? this.schemaIndex.getSchemaMetadata(symbolName),
    );

    const diagnostics = descriptors.map((d) => {
      const range = new vscode.Range(
        new vscode.Position(d.line, d.startChar),
        new vscode.Position(d.line, d.endChar),
      );
      const diag = new vscode.Diagnostic(
        range,
        d.message,
        vscode.DiagnosticSeverity.Warning,
      );
      diag.source = DIAGNOSTIC_SOURCE;
      diag.code = d.kind;
      return diag;
    });

    this.diagnosticCollection.set(document.uri, diagnostics);
  }

  /**
   * Clear and dispose the diagnostic collection.
   */
  dispose(): void {
    this.diagnosticCollection.clear();
    this.diagnosticCollection.dispose();
  }
}
