/**
 * Client-side go-to-definition for load()-imported symbols.
 *
 * The upstream starlark-lsp (tilt-dev/starlark-lsp) handles local definitions
 * inside the currently open .star file, but it does not know how to resolve
 * OCI-style load() paths like `load("schemas-k8s:v1.31/apps/v1.star", "X")`
 * into the extension's on-disk schema cache. This provider bridges that gap:
 * Cmd+Click / F12 on either the symbol string inside a load() call OR on a
 * bare identifier whose name was load()-imported jumps to the cached .star
 * source file at the correct definition line.
 *
 * Because VSCode merges DefinitionProvider results across providers, this is
 * additive to the upstream LSP — if this provider returns undefined, the LSP's
 * own definition provider still responds (preserving local go-to-def).
 *
 * v1 scope / non-goals:
 *   - Does NOT navigate from the path-string argument (the first load() arg)
 *     to the .star file itself. Intentional — follow-up if users request it.
 *   - Star imports inside load() (cursor on the `"*"`) jump to the target
 *     file at line 0; per-symbol line resolution still uses the file scan.
 */

import * as fs from "fs";
import * as vscode from "vscode";

import { parseLoadStatements } from "./load-parser";
import type { SchemaIndex } from "./schema-index";

/**
 * Find the zero-based line number where a top-level symbol is defined in
 * .star file content. Matches three forms at column 0:
 *   - `def Symbol(...)` — function definition
 *   - `Symbol = schema(...)` — schema declaration
 *   - `Symbol = <expr>` — any other top-level binding (e.g. function aliases
 *     like `kcl_generate_name = kcl.make_invocation(...)`), excluding `==`
 *     comparisons
 *
 * The third form is intentionally broader than SchemaIndex.extractTopLevelDefs
 * (which only tracks def and schema for completion/diagnostic scoping) — go-to-
 * definition wants to land on ANY top-level binding, not just exported schemas.
 *
 * Returns undefined if the symbol appears only indented (nested) or is absent.
 * When the symbol appears multiple times, returns the line of the first match.
 */
export function findSymbolLineInStarFile(
  content: string,
  symbol: string,
): number | undefined {
  const lines = content.split("\n");
  // Escape symbol for regex safety (symbol names are identifiers, but
  // defensive against future extension to '*' etc.).
  const esc = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^(?:def\\s+${esc}\\b|${esc}\\b\\s*=(?!=))`);
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) {
      return i;
    }
  }
  return undefined;
}

/** Result of locating the cursor inside a load() call's argument list. */
export type LoadArgumentHit =
  | {
      kind: "symbol";
      value: string;
      ociRef: string;
      tarEntryPath: string;
    }
  | {
      kind: "namespace";
      name: string;
      ociRef: string;
      tarEntryPath: string;
    };

/**
 * Classify the cursor position within parsed load() statements.
 *
 * Returns:
 *   - { kind: "symbol", value } when the cursor sits inside a positional
 *     quoted argument (excluding the first path string).
 *   - { kind: "namespace", name } when the cursor sits inside the
 *     identifier-left-side of a `name="value"` argument.
 *   - undefined when the cursor is inside the path string (first arg),
 *     outside any load() call, or inside whitespace/punctuation.
 *
 * Implementation: rely on parseLoadStatements to filter to valid OCI load
 * calls, then for each such statement walk the raw text forward from the
 * `load(` token, matching each `name="value"` or `"value"` argument to
 * record absolute offset ranges for the identifier, the quoted value, and
 * which argument is the first (path string) one.
 */
export function findLoadArgumentAtPosition(
  text: string,
  offset: number,
): LoadArgumentHit | undefined {
  const loads = parseLoadStatements(text);
  if (loads.length === 0) return undefined;

  // We re-find each load() call in the raw text to get accurate offsets.
  // parseLoadStatements gave us the structure; now we just need positions.
  const loadStartRe = /load\s*\(/g;
  // An argument is either `name="value"` or `"value"`; capture positions.
  // We use a non-global instance per load() scan to track offsets carefully.
  const argRe = /(?:(?<identStart>)(?<ident>\w+)\s*=\s*)?"(?<value>[^"]*)"/g;

  let loadMatch: RegExpExecArray | null;
  let loadIndex = 0;
  while ((loadMatch = loadStartRe.exec(text)) !== null) {
    const callStart = loadMatch.index;
    const openParenIdx = callStart + loadMatch[0].length - 1;

    // Find the matching closing paren for this load() call.
    // Load calls do not contain nested parens in normal usage, but scan
    // defensively with a depth counter that also respects quoted strings.
    let depth = 1;
    let i = openParenIdx + 1;
    let inStr = false;
    let closeIdx = -1;
    while (i < text.length) {
      const ch = text[i];
      if (inStr) {
        if (ch === "\\") {
          i += 2;
          continue;
        }
        if (ch === '"') inStr = false;
      } else {
        if (ch === '"') inStr = true;
        else if (ch === "(") depth++;
        else if (ch === ")") {
          depth--;
          if (depth === 0) {
            closeIdx = i;
            break;
          }
        }
      }
      i++;
    }
    if (closeIdx < 0) continue;

    // If the offset is outside this load() call, skip to the next one.
    if (offset < callStart || offset > closeIdx) continue;

    // Does this load() call correspond to a parsed (valid OCI) statement?
    // parseLoadStatements preserves order and filters non-OCI loads. We
    // detect whether THIS specific load() is one that was kept by peeking
    // at its first quoted argument and comparing to the next-unconsumed
    // parsed statement's fullPath.
    const argsPart = text.substring(openParenIdx + 1, closeIdx);
    const argsStart = openParenIdx + 1;

    // Reset argRe state per call
    const localRe = new RegExp(argRe.source, "g");
    let firstArgValue: string | undefined;
    const argHits: Array<{
      identName?: string;
      identStart?: number;
      identEnd?: number;
      valueStart: number;
      valueEnd: number;
      value: string;
      isFirst: boolean;
    }> = [];

    let am: RegExpExecArray | null;
    while ((am = localRe.exec(argsPart)) !== null) {
      const fullStart = am.index;
      const fullStr = am[0];
      const ident = am.groups?.ident;
      const value = am.groups?.value ?? "";

      // Find the position of the opening quote within the match, since the
      // `name=` prefix (if present) comes before it.
      const quoteOffsetInMatch = fullStr.indexOf('"');
      const valueStart = argsStart + fullStart + quoteOffsetInMatch + 1;
      const valueEnd = valueStart + value.length; // exclusive

      let identStart: number | undefined;
      let identEnd: number | undefined;
      if (ident) {
        identStart = argsStart + fullStart;
        identEnd = identStart + ident.length;
      }

      const isFirst = argHits.length === 0;
      if (isFirst) firstArgValue = value;

      argHits.push({
        identName: ident,
        identStart,
        identEnd,
        valueStart,
        valueEnd,
        value,
        isFirst,
      });
    }

    // If parseLoadStatements didn't include a statement for this load() call
    // (non-OCI path), bail out — we don't resolve non-OCI loads.
    const parsed = loads[loadIndex];
    // Advance loadIndex only if this call matches the next parsed statement.
    // parseLoadStatements filters out non-OCI paths so we have to match by
    // fullPath / first-arg-value; if not matched, don't consume parsed.
    let parsedHere: ReturnType<typeof parseLoadStatements>[number] | undefined;
    if (parsed && firstArgValue !== undefined) {
      const matchVal = parsed.fullPath === firstArgValue;
      if (matchVal) {
        parsedHere = parsed;
        loadIndex++;
      }
    }
    if (!parsedHere) continue;

    // Now classify the offset against argHits.
    for (const hit of argHits) {
      // Cursor inside the identifier part (name= side)?
      if (
        hit.identStart !== undefined &&
        hit.identEnd !== undefined &&
        offset >= hit.identStart &&
        offset <= hit.identEnd
      ) {
        return {
          kind: "namespace",
          name: hit.identName!,
          ociRef: parsedHere.ociRef,
          tarEntryPath: parsedHere.tarEntryPath,
        };
      }
      // Cursor inside the quoted value?
      if (offset >= hit.valueStart && offset <= hit.valueEnd) {
        if (hit.isFirst) {
          // Path-string argument — v1 does not resolve this.
          return undefined;
        }
        if (hit.identName) {
          // Cursor is inside the VALUE of a name="value" pair (e.g. inside
          // the "*" of k8s="*"). Report as namespace — the navigation target
          // is the file referenced by the namespace anyway.
          return {
            kind: "namespace",
            name: hit.identName,
            ociRef: parsedHere.ociRef,
            tarEntryPath: parsedHere.tarEntryPath,
          };
        }
        return {
          kind: "symbol",
          value: hit.value,
          ociRef: parsedHere.ociRef,
          tarEntryPath: parsedHere.tarEntryPath,
        };
      }
    }

    // Inside the load() call but not inside any argument — fall through.
    return undefined;
  }

  return undefined;
}

/**
 * vscode.DefinitionProvider implementation resolving load()-imported symbols
 * to cached .star files on disk.
 */
export class LoadDefinitionProvider implements vscode.DefinitionProvider {
  constructor(private readonly schemaIndex: SchemaIndex) {}

  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.Definition | vscode.DefinitionLink[]> {
    const text = document.getText();
    const offset = document.offsetAt(position);

    // 1. If the cursor is inside a load() call argument, resolve directly
    //    against that statement's ociRef + tarEntryPath (not the symbol-keyed
    //    reverse index, which collides when multiple versions are cached).
    const hit = findLoadArgumentAtPosition(text, offset);
    if (hit) {
      if (hit.kind === "symbol") {
        if (hit.value === "*") {
          // Star import: jump to the top of the loaded file.
          return this.resolveFile(hit.ociRef, hit.tarEntryPath);
        }
        // Explicit symbol — fall back to opening the file at line 0 if the
        // exact definition line can't be pinpointed (user still ends up in
        // the right file, which is better than doing nothing).
        return (
          this.resolveInLoad(hit.ociRef, hit.tarEntryPath, hit.value) ??
          this.resolveFile(hit.ociRef, hit.tarEntryPath)
        );
      }
      // Namespace hits are out of scope for v1 (see file header).
      return undefined;
    }

    // 2. Otherwise, try the identifier under the cursor — but only if a
    //    load() in THIS file brings the symbol into scope. This keeps
    //    multi-version caches correctly scoped and avoids leaky cross-file
    //    resolution via the global symbol index.
    const wordRange = document.getWordRangeAtPosition(position);
    if (!wordRange) return undefined;
    const word = text.substring(
      document.offsetAt(wordRange.start),
      document.offsetAt(wordRange.end),
    );
    if (!word) return undefined;

    // For namespace-member accesses like `k8s.Deployment`, detect the
    // preceding `<ns>.` so we can restrict resolution to the load() that
    // declared that namespace — independent of what the word itself is.
    const lineText = text.split("\n")[position.line] ?? "";
    const beforeWord = lineText.substring(
      0,
      document.offsetAt(wordRange.start) - document.offsetAt(
        new vscode.Position(position.line, 0),
      ),
    );
    const nsMatch = beforeWord.match(/(\w+)\.$/);
    const namespacePrefix = nsMatch ? nsMatch[1] : undefined;

    for (const stmt of parseLoadStatements(text)) {
      // Namespace member access: `<ns>.<word>` where <ns> was imported via
      // `ns="*"`. Resolve via the namespace's own load() so the correct
      // version wins when multiple tags are cached.
      if (namespacePrefix) {
        const ns = stmt.namespaces.find(
          (n) => n.name === namespacePrefix && n.value === "*",
        );
        if (ns) {
          const loc = this.resolveInLoad(stmt.ociRef, stmt.tarEntryPath, word);
          if (loc) return loc;
          // Namespace matched but the file doesn't bind `word` at top level —
          // don't fall through to other loads, this prefix clearly scopes to
          // this statement only.
          continue;
        }
      }
      // Directly named in load() — cheapest check.
      if (stmt.symbols.includes(word)) {
        const loc = this.resolveInLoad(stmt.ociRef, stmt.tarEntryPath, word);
        if (loc) return loc;
        // Named explicitly but line not found — still land in the file.
        return this.resolveFile(stmt.ociRef, stmt.tarEntryPath);
      }
      // Star import: probe the target file directly. resolveInLoad returns
      // undefined when the symbol is not bound at top level in that file,
      // which also acts as the "wrong star import" filter so a usage only
      // resolves to the load() whose file actually exports it.
      if (stmt.symbols.includes("*")) {
        const loc = this.resolveInLoad(stmt.ociRef, stmt.tarEntryPath, word);
        if (loc) return loc;
      }
    }
    return undefined;
  }

  /** Navigate to the top of the .star file identified by this load(). */
  private resolveFile(
    ociRef: string,
    tarEntryPath: string,
  ): vscode.Location | undefined {
    const absPath = this.schemaIndex.getAbsolutePathForLoad(
      ociRef,
      tarEntryPath,
    );
    if (!absPath) return undefined;
    const pos = new vscode.Position(0, 0);
    return new vscode.Location(
      vscode.Uri.file(absPath),
      new vscode.Range(pos, pos),
    );
  }

  /**
   * Resolve a symbol to a Location at its top-level binding line inside the
   * .star file identified by the given OCI ref + tar-entry path.
   *
   * Returns undefined if the file is missing, unreadable, or does not contain
   * a top-level binding of the symbol. Callers that want a "land in the file
   * anyway" fallback should combine with resolveFile().
   */
  private resolveInLoad(
    ociRef: string,
    tarEntryPath: string,
    symbol: string,
  ): vscode.Location | undefined {
    const absPath = this.schemaIndex.getAbsolutePathForLoad(
      ociRef,
      tarEntryPath,
    );
    if (!absPath) return undefined;
    let content: string;
    try {
      content = fs.readFileSync(absPath, "utf-8");
    } catch {
      return undefined;
    }
    const line = findSymbolLineInStarFile(content, symbol);
    if (line === undefined) return undefined;
    const pos = new vscode.Position(line, 0);
    return new vscode.Location(
      vscode.Uri.file(absPath),
      new vscode.Range(pos, pos),
    );
  }
}
