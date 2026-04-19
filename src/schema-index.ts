/**
 * Schema symbol index built from cached .star files.
 *
 * Extracts top-level def names and schema() assignments, providing
 * per-file and aggregate symbol lookups for middleware filtering.
 */

import * as fs from "fs";
import * as path from "path";
import { ociRefToCacheKey } from "./load-parser";
import { parseSchemas, type ParsedSchema } from "./schema-stubs";

/**
 * All builtin names from function-starlark that always pass through
 * middleware filtering regardless of load() statements.
 *
 * 22 functions + 6 variables + 6 modules = 34 total.
 */
export const BUILTIN_NAMES: ReadonlySet<string> = new Set([
  // Functions (15 original)
  "Resource",
  "skip_resource",
  "get",
  "get_label",
  "get_annotation",
  "get_observed",
  "set_condition",
  "set_xr_status",
  "emit_event",
  "set_connection_details",
  "fatal",
  "require_extra_resource",
  "require_extra_resources",
  "schema",
  "field",
  // Functions (7 new)
  "get_extra_resource",
  "get_extra_resources",
  "is_observed",
  "observed_body",
  "get_condition",
  "set_response_ttl",
  "struct",
  // Variables
  "oxr",
  "dxr",
  "observed",
  "context",
  "environment",
  "extra_resources",
  // Modules
  "crypto",
  "dict",
  "encoding",
  "regex",
  "yaml",
  "json",
]);

/**
 * The subset of BUILTIN_NAMES that are module names (not functions or variables).
 * Used by middleware to detect builtin module dot-completion contexts like "crypto."
 * and filter completions/hover to only that module's children.
 */
export const BUILTIN_MODULE_NAMES: ReadonlySet<string> = new Set([
  "crypto",
  "dict",
  "encoding",
  "regex",
  "yaml",
  "json",
]);

/**
 * Map of builtin module name → set of child function names.
 * Derived from the bundled starlark/*.py stub files.
 * Used by middleware to filter dot-completions to only the actual
 * functions belonging to the module (e.g., crypto.sha256 but not crypto.Resource).
 */
export const BUILTIN_MODULE_CHILDREN: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["crypto", new Set(["sha256", "sha512", "sha1", "md5", "hmac_sha256", "blake3", "stable_id"])],
  ["dict", new Set(["merge", "deep_merge", "pick", "omit", "dig", "has_path"])],
  ["encoding", new Set(["b64enc", "b64dec", "b64url_enc", "b64url_dec", "b32enc", "b32dec", "hex_enc", "hex_dec"])],
  ["regex", new Set(["match", "find", "find_all", "find_groups", "replace", "replace_all", "split"])],
  ["yaml", new Set(["encode", "decode", "decode_stream"])],
  ["json", new Set(["encode", "decode", "encode_indent", "indent"])],
]);

/** Parsed function documentation from a builtin module stub. */
export interface BuiltinFuncDoc {
  /** Function signature, e.g. "sha256(data)" */
  signature: string;
  /** Full docstring body */
  docstring: string;
}

/**
 * Parse a Python stub file and extract function signatures and docstrings.
 * Returns a map of function name → BuiltinFuncDoc.
 */
export function parseModuleStubDocs(content: string): Map<string, BuiltinFuncDoc> {
  const docs = new Map<string, BuiltinFuncDoc>();
  const funcRe = /^def\s+(\w+)\(([^)]*)\):\s*\n\s+"""([\s\S]*?)"""/gm;
  let match: RegExpExecArray | null;
  while ((match = funcRe.exec(content)) !== null) {
    const name = match[1];
    const params = match[2];
    const docstring = match[3].trim();
    docs.set(name, { signature: `${name}(${params})`, docstring });
  }
  return docs;
}

/**
 * Load all builtin module docs from the starlark/ stub directory.
 * Returns a map of module name → (function name → BuiltinFuncDoc).
 */
export function loadBuiltinModuleDocs(
  builtinsDir: string,
): Map<string, Map<string, BuiltinFuncDoc>> {
  const result = new Map<string, Map<string, BuiltinFuncDoc>>();
  for (const modName of BUILTIN_MODULE_NAMES) {
    const filePath = path.join(builtinsDir, `${modName}.py`);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      result.set(modName, parseModuleStubDocs(content));
    }
  }
  return result;
}

/**
 * Extract top-level def names and schema() assignments from .star file content.
 *
 * Matches:
 * - `def FunctionName(...):`  at the start of a line
 * - `VarName = schema(...)` at the start of a line
 *
 * Indented defs (nested functions) are ignored.
 */
export function extractTopLevelDefs(content: string): Set<string> {
  const re = /^(?:def\s+(\w+)|(\w+)\s*=\s*schema\s*\()/gm;
  const names = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = re.exec(content)) !== null) {
    const name = match[1] ?? match[2];
    if (name) {
      names.add(name);
    }
  }

  return names;
}

/**
 * Index of symbols exported by cached .star schema files.
 *
 * Scans a cache directory tree, extracts top-level definitions from each
 * .star file, and provides per-file and aggregate lookups.
 */
export class SchemaIndex {
  private index = new Map<string, Set<string>>();
  private reverseIndex = new Map<string, string>();
  private metadataIndex = new Map<string, ParsedSchema>();
  private cacheDir: string | undefined;

  /**
   * Scan a cache directory recursively and index all .star files.
   *
   * The relative path from cacheDir is used as the lookup key
   * (e.g., "schemas-k8s/v1.31/apps/v1.star").
   */
  buildFromCache(cacheDir: string): void {
    this.index.clear();
    this.reverseIndex.clear();
    this.metadataIndex.clear();
    this.cacheDir = cacheDir;
    this.walkDir(cacheDir, cacheDir);
  }

  /**
   * Re-scan the cache directory and update the index.
   * Alias for buildFromCache -- clears existing data and rebuilds.
   */
  rebuild(cacheDir: string): void {
    this.buildFromCache(cacheDir);
  }

  /**
   * Get the set of exported symbols for a specific .star file.
   *
   * @param tarEntryPath - Relative path from cache root (e.g., "schemas-k8s/v1.31/apps/v1.star")
   * @returns Set of symbol names, or empty set if file is unknown
   */
  getSymbolsForFile(tarEntryPath: string): ReadonlySet<string> {
    return this.index.get(tarEntryPath) ?? new Set();
  }

  /**
   * Get the .star file path that exports a given symbol.
   *
   * @param symbol - Symbol name to look up
   * @returns Relative file path from cache root, or undefined if not found
   */
  getFileForSymbol(symbol: string): string | undefined {
    return this.reverseIndex.get(symbol);
  }

  /**
   * Resolve a symbol to an absolute path on disk.
   *
   * Returns undefined if the symbol is unknown, the cache has never been built,
   * or the resolved file no longer exists on disk.
   */
  getAbsolutePathForSymbol(symbol: string): string | undefined {
    if (!this.cacheDir) return undefined;
    const rel = this.reverseIndex.get(symbol);
    if (!rel) return undefined;
    const abs = path.join(this.cacheDir, rel);
    return fs.existsSync(abs) ? abs : undefined;
  }

  /**
   * Resolve a specific load() target to an absolute path on disk.
   *
   * Uses the OCI ref + tar-entry path from the load statement directly, so
   * multiple cached versions of the same artifact (e.g. stdlib:v1.1.1 and
   * stdlib:v1.6.3) resolve to their own files instead of colliding in the
   * symbol-keyed reverse index.
   *
   * Returns undefined if the cache has never been built or the resolved file
   * no longer exists on disk.
   */
  getAbsolutePathForLoad(
    ociRef: string,
    tarEntryPath: string,
  ): string | undefined {
    if (!this.cacheDir) return undefined;
    const abs = path.join(this.cacheDir, ociRefToCacheKey(ociRef), tarEntryPath);
    return fs.existsSync(abs) ? abs : undefined;
  }

  /**
   * Get the parsed schema metadata for a given symbol name.
   *
   * @param symbolName - Schema constructor name (e.g., "Account")
   * @returns ParsedSchema with field-level metadata, or undefined if not found
   */
  getSchemaMetadata(symbolName: string): ParsedSchema | undefined {
    return this.metadataIndex.get(symbolName);
  }

  /**
   * Get the union of all symbols across all indexed .star files.
   */
  getAllSymbols(): ReadonlySet<string> {
    const all = new Set<string>();
    for (const symbols of this.index.values()) {
      for (const sym of symbols) {
        all.add(sym);
      }
    }
    return all;
  }

  private walkDir(dir: string, rootDir: string): void {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      const fullPath = path.join(dir, entry as string);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        this.walkDir(fullPath, rootDir);
      } else if ((entry as string).endsWith(".star")) {
        const content = fs.readFileSync(fullPath, "utf-8");
        const relativePath = path.relative(rootDir, fullPath);
        const symbols = extractTopLevelDefs(content);
        if (symbols.size > 0) {
          this.index.set(relativePath, symbols);
          for (const sym of symbols) {
            this.reverseIndex.set(sym, relativePath);
          }
        }
        // Parse and store schema metadata for type checking
        const schemas = parseSchemas(content);
        for (const schema of schemas) {
          this.metadataIndex.set(schema.name, schema);
        }
      }
    }
  }
}
