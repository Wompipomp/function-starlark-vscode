/**
 * Generate Python stub files from .star schema definitions.
 *
 * starlark-lsp only understands Python `def` statements for IntelliSense.
 * Schema files use `Name = schema("Name", doc="...", field=field(...))` syntax
 * which starlark-lsp can't parse for completions/hover/signature help.
 *
 * This module converts .star schema files to companion .py stub files
 * that starlark-lsp can process.
 */

import * as fs from "fs";
import * as path from "path";

export interface ParsedField {
  name: string;
  type: string;
  required: boolean;
  doc: string;
}

export interface ParsedSchema {
  name: string;
  doc: string;
  fields: ParsedField[];
}

/**
 * Extract the doc= string value from inside a schema() or field() call.
 * Handles escaped quotes within the string.
 */
function extractStringParam(text: string, param: string): string {
  const prefix = `${param}="`;
  const idx = text.indexOf(prefix);
  if (idx < 0) return "";

  let result = "";
  let i = idx + prefix.length;
  while (i < text.length) {
    if (text[i] === "\\" && i + 1 < text.length && text[i + 1] === '"') {
      result += '"';
      i += 2;
    } else if (text[i] === '"') {
      break;
    } else {
      result += text[i];
      i++;
    }
  }
  return result;
}

/**
 * Extract the type= value from a field() call.
 * Can be a string literal ("string") or a bare reference (ObjectMeta).
 */
function extractTypeParam(fieldText: string): string {
  const match = fieldText.match(/type=("([^"]*)"|([\w]+))/);
  if (!match) return "";
  return match[2] ?? match[3] ?? "";
}

/**
 * Check if required=True is present in a field() call.
 */
function isRequired(fieldText: string): boolean {
  return /required=True/.test(fieldText);
}

/**
 * Find the matching closing paren for an opening paren, handling nesting.
 */
export function findMatchingParen(text: string, openIdx: number): number {
  let depth = 1;
  let i = openIdx + 1;
  let inString = false;
  let stringChar = "";

  while (i < text.length && depth > 0) {
    const ch = text[i];

    if (inString) {
      if (ch === "\\" && i + 1 < text.length) {
        i += 2;
        continue;
      }
      if (ch === stringChar) {
        inString = false;
      }
    } else {
      if (ch === '"' || ch === "'") {
        inString = true;
        stringChar = ch;
      } else if (ch === "(") {
        depth++;
      } else if (ch === ")") {
        depth--;
      }
    }
    i++;
  }

  return depth === 0 ? i - 1 : -1;
}

export interface ParsedFunction {
  name: string;
  params: string;
  doc: string;
}

/**
 * Parse top-level def statements from .star file content.
 *
 * Extracts function name, parameter list, and optional docstring.
 * Only matches non-indented defs (top-level functions).
 */
export function parseFunctions(content: string): ParsedFunction[] {
  const functions: ParsedFunction[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^def\s+(\w+)\s*\(([^)]*)\)\s*:/);
    if (!match) continue;

    const name = match[1];
    const params = match[2].replace(/\s+/g, " ").trim().replace(/,\s*$/, "");

    // Look for docstring on next non-blank line
    let doc = "";
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === "") j++;

    if (j < lines.length) {
      const trimmed = lines[j].trim();
      if (trimmed.startsWith('"""')) {
        if (trimmed.endsWith('"""') && trimmed.length > 6) {
          // Single-line: """text"""
          doc = trimmed.slice(3, -3).trim();
        } else {
          // Multi-line: collect until closing """
          const docLines = [trimmed.slice(3)];
          j++;
          while (j < lines.length && !lines[j].includes('"""')) {
            docLines.push(lines[j]);
            j++;
          }
          if (j < lines.length) {
            const last = lines[j].trim().replace(/"""$/, "").trim();
            if (last) docLines.push(last);
          }
          doc = docLines.join("\n").trim();
        }
      }
    }

    functions.push({ name, params, doc });
  }

  return functions;
}

/**
 * Generate Python stub strings from parsed functions.
 */
export function generateFunctionStub(functions: ParsedFunction[]): string {
  if (functions.length === 0) return "";

  const lines: string[] = [];
  for (const fn of functions) {
    lines.push(`def ${fn.name}(${fn.params}):`);
    if (fn.doc) {
      if (fn.doc.includes("\n")) {
        lines.push(`    """${fn.doc}`);
        lines.push('    """');
      } else {
        lines.push(`    """${fn.doc}"""`);
      }
    }
    lines.push("    pass");
    lines.push("");
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * Parse all schema() definitions from .star file content.
 */
export function parseSchemas(content: string): ParsedSchema[] {
  const schemas: ParsedSchema[] = [];
  const schemaRe = /^(\w+)\s*=\s*schema\s*\(/gm;
  let match: RegExpExecArray | null;

  while ((match = schemaRe.exec(content)) !== null) {
    const name = match[1];
    const openParen = match.index + match[0].length - 1;
    const closeParen = findMatchingParen(content, openParen);
    if (closeParen < 0) continue;

    const body = content.substring(openParen + 1, closeParen);
    // Extract doc= from the schema level only (before first field= definition)
    const firstFieldIdx = body.search(/\w+=field\s*\(/);
    const schemaHeader = firstFieldIdx >= 0 ? body.substring(0, firstFieldIdx) : body;
    const doc = extractStringParam(schemaHeader, "doc");

    // Extract field definitions: fieldName=field(...)
    const fields: ParsedField[] = [];
    const fieldRe = /(\w+)=field\s*\(/g;
    let fieldMatch: RegExpExecArray | null;

    while ((fieldMatch = fieldRe.exec(body)) !== null) {
      const fieldName = fieldMatch[1];
      // Skip schema-level params that aren't fields
      if (fieldName === "doc" || fieldName === "name") continue;

      const fieldOpenParen =
        fieldMatch.index + fieldMatch[0].length - 1 + openParen + 1;
      const fieldCloseParen = findMatchingParen(content, fieldOpenParen);
      if (fieldCloseParen < 0) continue;

      const fieldBody = content.substring(fieldOpenParen + 1, fieldCloseParen);

      fields.push({
        name: fieldName,
        type: extractTypeParam(fieldBody),
        required: isRequired(fieldBody),
        doc: extractStringParam(fieldBody, "doc"),
      });
    }

    schemas.push({ name, doc, fields });
  }

  return schemas;
}

/**
 * Generate a Python stub string from parsed schemas.
 */
export function generateStub(schemas: ParsedSchema[]): string {
  const lines: string[] = [];

  for (const schema of schemas) {
    // Build parameter list: required params first (Python syntax requirement)
    const required = schema.fields.filter((f) => f.required);
    const optional = schema.fields.filter((f) => !f.required);
    const params = [
      ...required.map((f) => f.name),
      ...optional.map((f) => `${f.name}=None`),
    ];

    lines.push(`def ${schema.name}(${params.join(", ")}):`);

    // Build docstring — clean literal \n sequences to real newlines then take first line
    const cleanDoc = (s: string) => s.replace(/\\n/g, " ").replace(/\\t/g, " ").replace(/\s+/g, " ").trim();

    const docLines: string[] = [];
    if (schema.doc) {
      docLines.push(`    """${cleanDoc(schema.doc)}`);
    } else {
      docLines.push(`    """`);
    }

    if (schema.fields.length > 0) {
      docLines.push("");
      docLines.push("    Args:");
      for (const f of schema.fields) {
        const typePart = f.type ? `(${f.type})` : "";
        const reqPart = f.required ? " [required]" : "";
        // Clean and shorten doc for the parameter description
        const shortDoc = f.doc
          ? cleanDoc(f.doc).replace(/^[\w]+ - /, "")
          : "";
        docLines.push(
          `        ${f.name}${typePart}${reqPart}: ${shortDoc}`,
        );
      }
    }

    docLines.push('    """');
    lines.push(docLines.join("\n"));
    lines.push("    pass");
    lines.push("");
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Generate a single .py stub file from all .star files in a directory tree.
 *
 * starlark-lsp treats directories passed via --builtin-paths as Python
 * modules (namespaced by path), but files passed directly are treated as
 * global builtins. So we collect all schema definitions into one flat
 * _schemas.py file that gets passed as a file path to --builtin-paths.
 *
 * @param cacheDir - Root cache directory to scan
 * @returns Path to the generated stub file, or undefined if no schemas found
 */
export function generateStubFile(cacheDir: string): string | undefined {
  const allSchemas: ParsedSchema[] = [];
  const allFunctions: ParsedFunction[] = [];

  function walk(currentDir: string): void {
    const entries = fs.readdirSync(currentDir);
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry as string);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if ((entry as string).endsWith(".star")) {
        const content = fs.readFileSync(fullPath, "utf-8");
        allSchemas.push(...parseSchemas(content));
        allFunctions.push(...parseFunctions(content));
      }
    }
  }

  walk(cacheDir);

  if (allSchemas.length === 0 && allFunctions.length === 0) return undefined;

  // Deduplicate schemas by name
  const seen = new Set<string>();
  const uniqueSchemas = allSchemas.filter((s) => {
    if (seen.has(s.name)) return false;
    seen.add(s.name);
    return true;
  });

  // Deduplicate functions, excluding names already claimed by schemas
  const uniqueFunctions = allFunctions.filter((f) => {
    if (seen.has(f.name)) return false;
    seen.add(f.name);
    return true;
  });

  const stubPath = path.join(cacheDir, "__init__.py");
  const schemaStubs = generateStub(uniqueSchemas);
  const fnStubs = generateFunctionStub(uniqueFunctions);
  const newContent = schemaStubs + fnStubs;

  // Only write if content changed — avoids triggering FileSystemWatcher loops
  let existing = "";
  try { existing = fs.readFileSync(stubPath, "utf-8"); } catch { /* doesn't exist yet */ }
  if (existing !== newContent) {
    fs.writeFileSync(stubPath, newContent, "utf-8");
  }

  return stubPath;
}

/**
 * Write content to a file only if it differs from existing content.
 * Returns true if the file was written (content changed).
 */
function writeIfChanged(filePath: string, content: string): boolean {
  let existing = "";
  try { existing = fs.readFileSync(filePath, "utf-8"); } catch { /* doesn't exist */ }
  if (existing === content) return false;
  fs.writeFileSync(filePath, content, "utf-8");
  return true;
}

/**
 * Generate namespace module .py files for starlark-lsp.
 *
 * When the cache directory is passed as --builtin-paths (directory mode),
 * starlark-lsp treats each .py file as a module. A file named `k8s.py`
 * with `def Deployment(...)` provides `k8s.Deployment()` completions.
 *
 * This function creates one .py file per namespace, containing stubs
 * for all symbols accessible through that namespace.
 *
 * @param cacheDir - Root cache directory
 * @param namespaceFiles - Map of namespace name → list of cache-relative .star file paths
 * @returns true if any files were written (content changed)
 */
export function generateNamespaceStubs(
  cacheDir: string,
  namespaceFiles: Map<string, string[]>,
): boolean {
  let changed = false;

  for (const [nsName, filePaths] of namespaceFiles) {
    const allSchemas: ParsedSchema[] = [];
    const allFunctions: ParsedFunction[] = [];

    for (const relPath of filePaths) {
      const fullPath = path.join(cacheDir, relPath);
      try {
        const content = fs.readFileSync(fullPath, "utf-8");
        allSchemas.push(...parseSchemas(content));
        allFunctions.push(...parseFunctions(content));
      } catch {
        // File may not be downloaded yet
      }
    }

    if (allSchemas.length === 0 && allFunctions.length === 0) continue;

    // Deduplicate schemas
    const seen = new Set<string>();
    const uniqueSchemas = allSchemas.filter((s) => {
      if (seen.has(s.name)) return false;
      seen.add(s.name);
      return true;
    });

    // Deduplicate functions, excluding schema names
    const uniqueFunctions = allFunctions.filter((f) => {
      if (seen.has(f.name)) return false;
      seen.add(f.name);
      return true;
    });

    const stubPath = path.join(cacheDir, `${nsName}.py`);
    const content = generateStub(uniqueSchemas) + generateFunctionStub(uniqueFunctions);
    if (writeIfChanged(stubPath, content)) {
      changed = true;
    }
  }

  return changed;
}
