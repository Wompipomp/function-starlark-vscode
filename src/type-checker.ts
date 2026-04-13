/**
 * Pure-logic type checker for schema constructor calls.
 *
 * Zero VS Code dependencies -- operates on plain strings and returns
 * diagnostic descriptors that the provider layer converts to vscode.Diagnostic.
 */

import { findMatchingParen, type ParsedSchema } from "./schema-stubs";
import { maskStringsAndComments } from "./text-utils";

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
  kind: "missing-field" | "type-mismatch" | "unknown-field" | "enum-mismatch";
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

/** Detected literal type, or null if the value is a variable/expression. */
type LiteralType = "string" | "int" | "bool" | "None" | null;

/**
 * Detect the literal type of a value string.
 * Returns null for variables, expressions, and function calls.
 */
function detectLiteralType(valueText: string): LiteralType {
  const trimmed = valueText.trim();

  // String literals: "...", '...', """...""", '''...'''
  if (/^["']/.test(trimmed)) return "string";

  // Boolean literals: exactly True or False
  if (trimmed === "True" || trimmed === "False") return "bool";

  // None literal
  if (trimmed === "None") return "None";

  // Integer literals: decimal, hex, octal
  if (/^-?\d+$/.test(trimmed) || /^0[xXoO][\da-fA-F]+$/.test(trimmed))
    return "int";

  // Everything else: variable, expression, function call -- skip
  return null;
}

/**
 * Check if a literal type is compatible with a field's declared type.
 * Returns true if compatible or if we can't determine compatibility.
 */
function isTypeCompatible(
  fieldType: string,
  literalType: LiteralType,
): boolean {
  if (literalType === null) return true; // Skip non-literals

  // Primitive type fields
  const primitiveMap: Record<string, string> = {
    string: "string",
    int: "int",
    bool: "bool",
  };

  if (fieldType in primitiveMap) {
    return primitiveMap[fieldType] === literalType;
  }

  // Schema-typed fields (PascalCase like ObjectMeta, LabelSelector)
  // Any literal is wrong for a schema-typed field
  if (/^[A-Z]/.test(fieldType)) {
    return false;
  }

  // Empty type or unknown type -- can't check, allow anything
  return true;
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
  const masked = maskStringsAndComments(text);
  const callRe = /\b(?:(\w+)\.)?([A-Z]\w*)\s*\(/g;

  let match: RegExpExecArray | null;
  while ((match = callRe.exec(masked)) !== null) {
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

    // Build field lookup map
    const fieldMap = new Map(schema.fields.map((f) => [f.name, f]));

    // Compute squiggle range for the constructor symbol name
    // For namespace-qualified: "storage.Account(" -> squiggle on "Account" only
    const symbolStartOffset = nsPrefix
      ? match.index + nsPrefix.length + 1 // skip "prefix."
      : match.index;

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

    // Check each keyword argument for type mismatches and unknown fields
    for (const arg of kwArgs) {
      const field = fieldMap.get(arg.name);

      if (!field) {
        // Unknown field
        const pos = offsetToLineChar(text, arg.nameOffset);
        diagnostics.push({
          line: pos.line,
          startChar: pos.char,
          endChar: pos.char + arg.name.length,
          message: `Unknown field "${arg.name}" in ${symbolName}()`,
          kind: "unknown-field",
        });
        continue;
      }

      const literalType = detectLiteralType(arg.valueText);
      // None is a valid sentinel for optional fields in Starlark
      if (literalType === "None" && !field.required) continue;

      // Type mismatch checking
      let typeOk = true;
      if (field.type) {
        if (!isTypeCompatible(field.type, literalType)) {
          typeOk = false;
          const pos = offsetToLineChar(text, arg.valueOffset);
          // Compute the trimmed value length for the squiggle
          const trimmedValue = arg.valueText.trim();
          diagnostics.push({
            line: pos.line,
            startChar: pos.char,
            endChar: pos.char + trimmedValue.length,
            message: `Field "${arg.name}" expects ${field.type}, got ${literalType}`,
            kind: "type-mismatch",
          });
        }
      }

      // Enum validation: only for string literals against non-empty enum lists
      // Type-mismatch takes priority -- skip enum check if type check failed
      if (typeOk && field.enum.length > 0 && literalType === "string") {
        const rawValue = arg.valueText.trim().replace(/^["']|["']$/g, "");
        if (!field.enum.includes(rawValue)) {
          const pos = offsetToLineChar(text, arg.valueOffset);
          const trimmedValue = arg.valueText.trim();
          diagnostics.push({
            line: pos.line,
            startChar: pos.char,
            endChar: pos.char + trimmedValue.length,
            message: `Invalid value "${rawValue}" for field "${arg.name}" \u2014 allowed: ${field.enum.map(v => `"${v}"`).join(", ")}`,
            kind: "enum-mismatch",
          });
        }
      }
    }
  }

  return diagnostics;
}
