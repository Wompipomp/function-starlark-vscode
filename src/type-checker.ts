/**
 * Pure-logic type checker for schema constructor calls.
 *
 * Zero VS Code dependencies -- operates on plain strings and returns
 * diagnostic descriptors that the provider layer converts to vscode.Diagnostic.
 */

import { findMatchingParen, type ParsedSchema } from "./schema-stubs";

/** A diagnostic descriptor with no VS Code dependencies. */
export interface DiagnosticDescriptor {
  /** Line number (0-based) */
  line: number;
  /** Start character within the line (0-based) */
  startChar: number;
  /** End character within the line (0-based, exclusive) */
  endChar: number;
  /** Human-readable diagnostic message */
  message: string;
  /** Diagnostic kind for classification */
  kind: "missing-field" | "type-mismatch" | "unknown-field";
}

/** Schema metadata needed for type checking. */
export type SchemaMetadata = ParsedSchema;

/** A parsed keyword argument from a constructor call. */
interface ParsedArgument {
  name: string;
  nameOffset: number; // character offset in document
  valueText: string;
  valueOffset: number; // character offset in document
}

/**
 * Skip past a value in an argument body, handling strings, nested
 * parens/brackets/braces. Returns the index after the value.
 */
function skipValue(body: string, start: number): number {
  let i = start;
  let depth = 0;

  while (i < body.length) {
    const ch = body[i];

    // Handle string literals
    if (ch === '"' || ch === "'") {
      // Check for triple-quoted strings
      const triple = body.substring(i, i + 3);
      if (triple === '"""' || triple === "'''") {
        const closer = triple;
        i += 3;
        while (i < body.length) {
          if (body[i] === "\\" && i + 1 < body.length) {
            i += 2;
            continue;
          }
          if (body.substring(i, i + 3) === closer) {
            i += 3;
            break;
          }
          i++;
        }
        continue;
      }

      // Single/double-quoted string
      const quote = ch;
      i++;
      while (i < body.length) {
        if (body[i] === "\\" && i + 1 < body.length) {
          i += 2;
          continue;
        }
        if (body[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    // Nesting
    if (ch === "(" || ch === "[" || ch === "{") {
      depth++;
      i++;
      continue;
    }
    if (ch === ")" || ch === "]" || ch === "}") {
      if (depth === 0) break;
      depth--;
      i++;
      continue;
    }

    // Comma at top level signals end of value
    if (ch === "," && depth === 0) break;

    i++;
  }

  return i;
}

/**
 * Parse keyword arguments from the argument body of a constructor call.
 */
function parseKeywordArgs(
  argBody: string,
  bodyStartOffset: number,
): ParsedArgument[] {
  const args: ParsedArgument[] = [];
  let i = 0;

  while (i < argBody.length) {
    // Skip whitespace and commas
    while (i < argBody.length && /[\s,]/.test(argBody[i])) i++;
    if (i >= argBody.length) break;

    // Try to match keyword=value
    const kwMatch = argBody.substring(i).match(/^(\w+)\s*=\s*/);
    if (!kwMatch) {
      // Positional arg or unparseable -- skip to next comma
      i = skipValue(argBody, i);
      continue;
    }

    const name = kwMatch[1];
    const nameOffset = bodyStartOffset + i;
    i += kwMatch[0].length;
    const valueOffset = bodyStartOffset + i;

    // Extract value (handle strings, nested parens/brackets/braces)
    const valueStart = i;
    i = skipValue(argBody, i);
    const valueText = argBody.substring(valueStart, i).trim();

    args.push({ name, nameOffset, valueText, valueOffset });
  }

  return args;
}

/**
 * Compute (line, character) from a document offset.
 */
function offsetToLineChar(
  text: string,
  offset: number,
): { line: number; char: number } {
  let line = 0;
  let lineStart = 0;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === "\n") {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, char: offset - lineStart };
}

/**
 * Check all schema constructor calls in the document text.
 *
 * Returns diagnostic descriptors for missing fields, type mismatches,
 * and unknown fields.
 */
export function checkDocument(
  text: string,
  importedSymbols: Set<string>,
  namespaceSymbols: Map<string, Set<string>>,
  getSchemaMetadata: (symbolName: string) => SchemaMetadata | undefined,
): DiagnosticDescriptor[] {
  const diagnostics: DiagnosticDescriptor[] = [];
  const callRe = /\b(?:(\w+)\.)?([A-Z]\w*)\s*\(/g;

  let match: RegExpExecArray | null;
  while ((match = callRe.exec(text)) !== null) {
    const nsPrefix = match[1]; // undefined for bare calls
    const symbolName = match[2];

    // Determine if this constructor is imported
    let isImported = false;
    if (nsPrefix) {
      const nsSyms = namespaceSymbols.get(nsPrefix);
      if (nsSyms?.has(symbolName)) isImported = true;
    } else {
      if (importedSymbols.has(symbolName)) isImported = true;
    }

    if (!isImported) continue;

    // Look up schema metadata
    const schema = getSchemaMetadata(symbolName);
    if (!schema) continue;

    // Find the opening paren position in text
    const fullMatchText = match[0];
    const openParenIdx = match.index + fullMatchText.length - 1;

    // Find the closing paren
    const closeParenIdx = findMatchingParen(text, openParenIdx);
    if (closeParenIdx < 0) continue;

    // Extract the argument body (between parens)
    const argBody = text.substring(openParenIdx + 1, closeParenIdx);
    const bodyStartOffset = openParenIdx + 1;

    // Parse keyword arguments
    const kwArgs = parseKeywordArgs(argBody, bodyStartOffset);
    const providedFields = new Set(kwArgs.map((a) => a.name));

    // Compute squiggle range for the constructor symbol name
    // For namespace-qualified: "storage.Account(" -> squiggle on "Account" only
    const symbolStartOffset = nsPrefix
      ? match.index + nsPrefix.length + 1 // skip "prefix."
      : match.index;
    const symbolEndOffset = symbolStartOffset + symbolName.length;

    // Check for missing required fields
    for (const field of schema.fields) {
      if (field.required && !providedFields.has(field.name)) {
        const pos = offsetToLineChar(text, symbolStartOffset);
        diagnostics.push({
          line: pos.line,
          startChar: pos.char,
          endChar: pos.char + symbolName.length,
          message: `Missing required field "${field.name}" in ${symbolName}()`,
          kind: "missing-field",
        });
      }
    }
  }

  return diagnostics;
}
