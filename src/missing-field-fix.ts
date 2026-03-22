/**
 * Quick-fix code action provider for missing required fields in schema constructors.
 *
 * When TypeWarningProvider reports "Missing required field" diagnostics,
 * this provider offers a single "Add missing required fields" quick fix
 * that inserts all missing fields with typed placeholder values using
 * SnippetTextEdit for tab-stop navigation.
 */

import * as vscode from "vscode";
import type { SchemaIndex } from "./schema-index";
import { findMatchingParen } from "./schema-stubs";

/** Regex to extract field name and schema name from diagnostic messages. */
const MESSAGE_RE = /^Missing required field "(\w+)" in (\w+)\(\)$/;

/**
 * Provides "Add missing required fields" quick-fix code actions for
 * schema constructor calls that are missing required fields.
 */
export class MissingFieldQuickFixProvider implements vscode.CodeActionProvider {
  static readonly metadata = {
    providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
  };

  private readonly schemaIndex: SchemaIndex;

  constructor(schemaIndex: SchemaIndex) {
    this.schemaIndex = schemaIndex;
  }

  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    // Filter to only missing-field diagnostics from our source
    const relevant = context.diagnostics.filter(
      (d) => d.source === "functionStarlark" && d.code === "missing-field",
    );
    if (relevant.length === 0) return [];

    // Group by range key (same constructor = same squiggle position)
    const groups = new Map<string, vscode.Diagnostic[]>();
    for (const diag of relevant) {
      const key = `${diag.range.start.line}:${diag.range.start.character}`;
      const group = groups.get(key) ?? [];
      group.push(diag);
      groups.set(key, group);
    }

    const actions: vscode.CodeAction[] = [];
    for (const diags of groups.values()) {
      const action = this.createFixAction(document, diags);
      if (action) actions.push(action);
    }

    return actions;
  }

  private createFixAction(
    document: vscode.TextDocument,
    diags: vscode.Diagnostic[],
  ): vscode.CodeAction | undefined {
    // Extract field names and schema name from diagnostic messages
    const fieldNames: string[] = [];
    let schemaName = "";

    for (const diag of diags) {
      const match = diag.message.match(MESSAGE_RE);
      if (!match) continue;
      fieldNames.push(match[1]);
      if (!schemaName) schemaName = match[2];
    }

    if (fieldNames.length === 0 || !schemaName) return undefined;

    // Get schema metadata for field type lookup
    const schema = this.schemaIndex.getSchemaMetadata(schemaName);
    if (!schema) return undefined;

    // Find insertion point: locate the closing paren of the constructor call
    const text = document.getText();
    const firstDiag = diags[0];

    // Get the end of the constructor name from the diagnostic range
    const nameEndOffset = document.offsetAt(firstDiag.range.end);

    // Find opening paren after constructor name end
    let openParenOffset = -1;
    for (let i = nameEndOffset; i < text.length; i++) {
      if (text[i] === "(") {
        openParenOffset = i;
        break;
      }
    }
    if (openParenOffset < 0) return undefined;

    // Find closing paren
    const closeParenOffset = findMatchingParen(text, openParenOffset);
    if (closeParenOffset < 0) return undefined;

    // Determine if leading comma is needed
    const argBody = text.substring(openParenOffset + 1, closeParenOffset);
    const needsLeadingComma =
      argBody.trim().length > 0 && !argBody.trimEnd().endsWith(",");

    // Order fields by schema definition order, filtering to only the missing ones
    const missingFieldNames = new Set(fieldNames);
    const orderedFields = schema.fields.filter((f) =>
      missingFieldNames.has(f.name),
    );

    // Detect indentation from the line containing the opening paren
    const openParenPos = document.positionAt(openParenOffset);
    const openParenLine = document.lineAt(openParenPos.line);
    const lineText = openParenLine.text;
    const baseIndent = lineText.match(/^(\s*)/)?.[1] ?? "";
    const fieldIndent = baseIndent + "    ";

    // Build snippet string
    const snippet = new vscode.SnippetString();
    if (needsLeadingComma) {
      snippet.appendText(",");
    }

    let tabIndex = 1;
    for (const field of orderedFields) {
      snippet.appendText("\n" + fieldIndent + field.name + " = ");
      buildPlaceholder(snippet, field.type, tabIndex++);
      snippet.appendText(",");
    }

    if (orderedFields.length > 0) {
      snippet.appendText("\n" + baseIndent);
    }

    // Create code action
    const fieldList = orderedFields.map((f) => f.name).join(", ");
    const action = new vscode.CodeAction(
      `Add missing required fields (${fieldList})`,
      vscode.CodeActionKind.QuickFix,
    );

    // Insert at close paren position
    const insertPosition = document.positionAt(closeParenOffset);
    const edit = new vscode.WorkspaceEdit();
    edit.set(document.uri, [vscode.SnippetTextEdit.insert(insertPosition, snippet)]);

    action.edit = edit;
    action.diagnostics = diags;
    action.isPreferred = true;

    return action;
  }
}

/**
 * Append a typed placeholder to the snippet string based on field type.
 *
 * - string: cursor inside quotes ("$tabstop")
 * - int: placeholder "0"
 * - bool: placeholder "False"
 * - PascalCase: placeholder "TypeName()"
 * - unknown/empty: placeholder "None"
 */
function buildPlaceholder(
  snippet: vscode.SnippetString,
  fieldType: string,
  tabIndex: number,
): void {
  switch (fieldType) {
    case "string":
      snippet.appendText('"');
      snippet.appendTabstop(tabIndex);
      snippet.appendText('"');
      break;
    case "int":
      snippet.appendPlaceholder("0", tabIndex);
      break;
    case "bool":
      snippet.appendPlaceholder("False", tabIndex);
      break;
    default:
      if (fieldType && /^[A-Z]/.test(fieldType)) {
        snippet.appendPlaceholder(`${fieldType}()`, tabIndex);
      } else {
        snippet.appendPlaceholder("None", tabIndex);
      }
      break;
  }
}
