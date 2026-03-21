/**
 * Schema symbol index built from cached .star files.
 *
 * Extracts top-level def names and schema() assignments, providing
 * per-file and aggregate symbol lookups for middleware filtering.
 */

import * as fs from "fs";
import * as path from "path";

/**
 * All builtin names from function-starlark that always pass through
 * middleware filtering regardless of load() statements.
 *
 * 15 functions + 6 variables = 21 total.
 */
export const BUILTIN_NAMES: ReadonlySet<string> = new Set([
  // Functions
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
  // Variables
  "oxr",
  "dxr",
  "observed",
  "context",
  "environment",
  "extra_resources",
]);

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

  /**
   * Scan a cache directory recursively and index all .star files.
   *
   * The relative path from cacheDir is used as the lookup key
   * (e.g., "schemas-k8s/v1.31/apps/v1.star").
   */
  buildFromCache(cacheDir: string): void {
    this.index.clear();
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
        }
      }
    }
  }
}
