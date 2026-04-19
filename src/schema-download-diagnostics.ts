/**
 * Diagnostics for failed OCI schema downloads.
 *
 * When the downloader can't fetch an artifact (auth failure, 404, network),
 * this provider places an Error-severity diagnostic on every `load()`
 * statement in the current document that references the failing OCI ref.
 * The diagnostic shows up in VSCode's Problems panel and as a red squiggle
 * in the editor, so the user sees "why don't I have completions?" without
 * opening the output channel.
 *
 * Diagnostics are scoped per document + ociRef and cleared when a later
 * download for the same ociRef succeeds.
 */

import * as vscode from "vscode";
import type { OciDownloadError } from "./oci/errors";
import { parseLoadStatements } from "./load-parser";

/** A short human-readable summary of an OCI download failure. */
export function formatDownloadFailure(err: OciDownloadError): string {
  switch (err.kind) {
    case "auth":
      return (
        `Authentication failed for ${err.registryHost} ` +
        `(HTTP ${err.httpStatus ?? "?"}). ` +
        `Run \`docker login ${err.registryHost}\` or check your credential helper.`
      );
    case "notFound":
      return (
        `Artifact not found: ${err.reference}. ` +
        `Check that the tag exists on ${err.registryHost}.`
      );
    case "network":
      return `Network error reaching ${err.registryHost}: ${err.message}`;
    default:
      return `Schema download failed for ${err.reference}: ${err.message}`;
  }
}

/**
 * Find the range of every `load()` statement in document text whose OCI ref
 * matches the given ociRef. Returns ranges spanning from `load` to the
 * matching closing `)`, which is what a VSCode diagnostic will underline.
 *
 * The ociRef comparison is against the parsed, normalized OCI ref (so
 * `oci://` prefix, `schemas-k8s:v1` vs full URI, etc. all compare correctly).
 */
export function findLoadRangesForOciRef(
  text: string,
  ociRef: string,
): vscode.Range[] {
  const parsed = parseLoadStatements(text);
  const matching = parsed.filter((p) => p.ociRef === ociRef);
  if (matching.length === 0) return [];

  const ranges: vscode.Range[] = [];
  const loadRe = /load\s*\(/g;
  let m: RegExpExecArray | null;
  let parsedIdx = 0;

  while ((m = loadRe.exec(text)) !== null && parsedIdx < parsed.length) {
    const start = m.index;
    const openParen = start + m[0].length - 1;

    let depth = 1;
    let i = openParen + 1;
    let inStr = false;
    let close = -1;
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
            close = i;
            break;
          }
        }
      }
      i++;
    }
    if (close < 0) continue;

    // Only count this load() if parseLoadStatements also kept it (i.e. it's a
    // valid OCI load, not a Bazel label). We track by advancing parsedIdx in
    // lockstep with the regex iteration over valid loads.
    const first = text.indexOf('"', openParen + 1);
    if (first < 0 || first > close) continue;
    const firstEnd = text.indexOf('"', first + 1);
    if (firstEnd < 0 || firstEnd > close) continue;
    const firstValue = text.substring(first + 1, firstEnd);

    const p = parsed[parsedIdx];
    if (!p || p.fullPath !== firstValue) {
      // This load() was skipped by parseLoadStatements (non-OCI) — don't advance.
      continue;
    }
    parsedIdx++;

    if (p.ociRef !== ociRef) continue;

    // Compute Position objects from byte offsets by walking newlines.
    ranges.push(toRange(text, start, close + 1));
  }

  return ranges;
}

function toRange(text: string, startOffset: number, endOffset: number): vscode.Range {
  return new vscode.Range(
    offsetToPosition(text, startOffset),
    offsetToPosition(text, endOffset),
  );
}

function offsetToPosition(text: string, offset: number): vscode.Position {
  let line = 0;
  let col = 0;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === "\n") {
      line++;
      col = 0;
    } else {
      col++;
    }
  }
  return new vscode.Position(line, col);
}

/**
 * Manages download-failure diagnostics across open starlark documents.
 *
 * Usage:
 *   - `reportFailure(doc, ociRef, err)` when a download rejects
 *   - `clearFor(ociRef)` when a later download for the same ref succeeds
 *   - `refreshDocument(doc)` to re-render diagnostics for a specific doc
 *     (e.g. when its text changes)
 */
export class SchemaDownloadDiagnostics implements vscode.Disposable {
  private readonly collection: vscode.DiagnosticCollection;
  /** Per-ociRef state: which documents currently show a diagnostic, and why. */
  private readonly failures = new Map<
    string,
    { message: string; severity: vscode.DiagnosticSeverity; docUris: Set<string> }
  >();

  constructor(collection: vscode.DiagnosticCollection) {
    this.collection = collection;
  }

  /** Record a download failure and update the affected document's diagnostics. */
  reportFailure(
    document: vscode.TextDocument,
    ociRef: string,
    err: OciDownloadError,
  ): void {
    const message = formatDownloadFailure(err);
    const state = this.failures.get(ociRef) ?? {
      message,
      severity: vscode.DiagnosticSeverity.Error,
      docUris: new Set<string>(),
    };
    state.message = message;
    state.docUris.add(document.uri.toString());
    this.failures.set(ociRef, state);
    this.refreshDocument(document);
  }

  /**
   * Clear all diagnostics for a given ociRef (e.g. after a successful retry).
   * Refreshes each document that currently shows a diagnostic for this ref.
   */
  clearFor(ociRef: string): void {
    const state = this.failures.get(ociRef);
    if (!state) return;
    const uris = Array.from(state.docUris);
    this.failures.delete(ociRef);
    for (const uriStr of uris) {
      const uri = vscode.Uri.parse(uriStr);
      const doc = vscode.workspace.textDocuments.find(
        (d) => d.uri.toString() === uriStr,
      );
      if (doc) {
        this.refreshDocument(doc);
      } else {
        this.collection.delete(uri);
      }
    }
  }

  /** Recompute diagnostics for a document from the current failure state. */
  refreshDocument(document: vscode.TextDocument): void {
    const uriStr = document.uri.toString();
    const text = document.getText();
    const diagnostics: vscode.Diagnostic[] = [];

    for (const [ociRef, state] of this.failures) {
      if (!state.docUris.has(uriStr)) continue;
      const ranges = findLoadRangesForOciRef(text, ociRef);
      if (ranges.length === 0) {
        // No matching load() left in this doc — drop this doc from the state.
        state.docUris.delete(uriStr);
        if (state.docUris.size === 0) this.failures.delete(ociRef);
        continue;
      }
      for (const range of ranges) {
        const diag = new vscode.Diagnostic(
          range,
          state.message,
          state.severity,
        );
        diag.source = "function-starlark";
        diag.code = "schema-download-failed";
        diagnostics.push(diag);
      }
    }

    if (diagnostics.length === 0) {
      this.collection.delete(document.uri);
    } else {
      this.collection.set(document.uri, diagnostics);
    }
  }

  /** Stop tracking a specific document (called when it's closed). */
  forgetDocument(uri: vscode.Uri): void {
    const uriStr = uri.toString();
    for (const [ociRef, state] of this.failures) {
      if (state.docUris.delete(uriStr) && state.docUris.size === 0) {
        this.failures.delete(ociRef);
      }
    }
    this.collection.delete(uri);
  }

  dispose(): void {
    this.failures.clear();
    this.collection.clear();
  }
}
