/**
 * VS Code diagnostic provider for schema type warnings.
 *
 * Thin wrapper around the pure-logic type checker. Owns a separate
 * DiagnosticCollection ("functionStarlarkTypeWarnings") to prevent
 * clobbering with the existing missing-import DiagnosticCollection.
 */

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { checkDocument } from "./type-checker";
import { getDocumentImports } from "./middleware";
import { BUILTIN_NAMES, type SchemaIndex } from "./schema-index";
import { parseSchemas, type ParsedSchema } from "./schema-stubs";

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
  private readonly cacheDir: string;

  constructor(schemaIndex: SchemaIndex, cacheDir: string) {
    this.schemaIndex = schemaIndex;
    this.cacheDir = cacheDir;
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

      // Attach relatedInformation linking to schema/field definition
      const ri = this.buildRelatedInformation(d, localSchemaMap, document);
      if (ri) {
        diag.relatedInformation = [ri];
      }

      return diag;
    });

    this.diagnosticCollection.set(document.uri, diagnostics);
  }

  /**
   * Build a DiagnosticRelatedInformation linking to the schema field (or schema name)
   * definition in the source file. Returns undefined if the source cannot be resolved.
   */
  private buildRelatedInformation(
    d: { schemaName: string; fieldName?: string; kind: string },
    localSchemaMap: Map<string, ParsedSchema>,
    document: vscode.TextDocument,
  ): vscode.DiagnosticRelatedInformation | undefined {
    // Look up schema metadata — local first, then cached
    const schema = localSchemaMap.get(d.schemaName) ?? this.schemaIndex.getSchemaMetadata(d.schemaName);
    if (!schema) return undefined;

    const isLocal = localSchemaMap.has(d.schemaName);

    // Resolve target URI
    let targetUri: vscode.Uri | undefined;
    if (isLocal) {
      targetUri = document.uri as vscode.Uri;
    } else {
      const relativePath = this.schemaIndex.getFileForSymbol(d.schemaName);
      if (!relativePath) return undefined;
      const absPath = path.join(this.cacheDir, relativePath);
      if (!fs.existsSync(absPath)) return undefined;
      targetUri = vscode.Uri.file(absPath);
    }

    // Determine target line and label
    let targetLine: number;
    let label: string;
    if (d.kind === "unknown-field") {
      targetLine = schema.nameLine;
      label = `'${d.schemaName}' defined here`;
    } else {
      const field = schema.fields.find(f => f.name === d.fieldName);
      targetLine = field ? field.line : schema.nameLine;
      label = `'${d.fieldName}' defined here`;
    }

    const targetRange = new vscode.Range(
      new vscode.Position(targetLine, 0),
      new vscode.Position(targetLine, 0),
    );
    const location = new vscode.Location(targetUri, targetRange);
    return new vscode.DiagnosticRelatedInformation(location, label);
  }

  /**
   * Clear and dispose the diagnostic collection.
   */
  dispose(): void {
    this.diagnosticCollection.clear();
    this.diagnosticCollection.dispose();
  }
}
