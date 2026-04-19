import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

import {
  findSymbolLineInStarFile,
  findLoadArgumentAtPosition,
  LoadDefinitionProvider,
} from "./load-definition-provider";
import { SchemaIndex } from "./schema-index";

/**
 * Create a minimal vscode.TextDocument-like object backed by raw text.
 * Mirrors the pattern in missing-field-fix.test.ts — we build positionAt /
 * offsetAt by line length so the provider's offset math is exercised.
 */
function createMockDocument(text: string): vscode.TextDocument {
  const lines = text.split("\n");

  function positionAt(offset: number): vscode.Position {
    let remaining = offset;
    for (let line = 0; line < lines.length; line++) {
      const lineLen =
        line < lines.length - 1 ? lines[line].length + 1 : lines[line].length;
      if (remaining < lineLen) {
        return new vscode.Position(line, remaining);
      }
      remaining -= lineLen;
    }
    return new vscode.Position(
      lines.length - 1,
      lines[lines.length - 1].length,
    );
  }

  function offsetAt(position: vscode.Position): number {
    let offset = 0;
    for (let i = 0; i < position.line && i < lines.length; i++) {
      offset += lines[i].length + 1;
    }
    offset += position.character;
    return offset;
  }

  function getWordRangeAtPosition(
    position: vscode.Position,
  ): vscode.Range | undefined {
    const line = lines[position.line] ?? "";
    const wordRe = /[A-Za-z_][A-Za-z0-9_]*/g;
    let m: RegExpExecArray | null;
    while ((m = wordRe.exec(line)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (position.character >= start && position.character <= end) {
        return new vscode.Range(
          new vscode.Position(position.line, start),
          new vscode.Position(position.line, end),
        );
      }
    }
    return undefined;
  }

  return {
    uri: { toString: () => "file:///test.star", fsPath: "/test.star" },
    getText: () => text,
    positionAt,
    offsetAt,
    getWordRangeAtPosition,
    lineAt: (line: number) => ({ text: lines[line] ?? "" }),
    languageId: "starlark",
  } as unknown as vscode.TextDocument;
}

describe("findSymbolLineInStarFile", () => {
  it("returns line number of top-level def", () => {
    const content = [
      "# header",
      "",
      'load("pkg:tag/mod.star", "X")',
      "",
      "",
      "def Account(spec):",
      "    pass",
    ].join("\n");
    expect(findSymbolLineInStarFile(content, "Account")).toBe(5);
  });

  it("returns line number of schema() assignment", () => {
    const content = [
      "# header",
      "",
      'Deployment = schema("Deployment", replicas=field())',
    ].join("\n");
    expect(findSymbolLineInStarFile(content, "Deployment")).toBe(2);
  });

  it("returns undefined for indented-only (non-top-level) matches", () => {
    const content = [
      "def TopLevel():",
      "    def NotThis(spec):",
      "        pass",
    ].join("\n");
    expect(findSymbolLineInStarFile(content, "NotThis")).toBeUndefined();
  });

  it("returns undefined when symbol is absent", () => {
    const content = "def Something(x):\n    pass\n";
    expect(findSymbolLineInStarFile(content, "Missing")).toBeUndefined();
  });

  it("returns the first match when the symbol appears twice", () => {
    const content = [
      "def Dup():",
      "    pass",
      "",
      "def Dup():",
      "    pass",
    ].join("\n");
    expect(findSymbolLineInStarFile(content, "Dup")).toBe(0);
  });
});

describe("findLoadArgumentAtPosition", () => {
  const sample = 'load("schemas-k8s:v1.31/apps/v1.star", "Account", "Deployment")\n';

  it("returns symbol kind when cursor is inside a symbol string argument", () => {
    // Find offset of "Account" (inside the quotes)
    const accountOffset = sample.indexOf('"Account"') + 2; // inside "Ac..."
    const result = findLoadArgumentAtPosition(sample, accountOffset);
    expect(result).toEqual({
      kind: "symbol",
      value: "Account",
      ociRef: "schemas-k8s:v1.31",
      tarEntryPath: "apps/v1.star",
    });
  });

  it("returns symbol kind for star import", () => {
    const star = 'load("schemas-k8s:v1.31/apps/v1.star", "*")\n';
    const offset = star.indexOf('"*"') + 1;
    const result = findLoadArgumentAtPosition(star, offset);
    expect(result).toEqual({
      kind: "symbol",
      value: "*",
      ociRef: "schemas-k8s:v1.31",
      tarEntryPath: "apps/v1.star",
    });
  });

  it("returns namespace kind when cursor is inside the namespace identifier", () => {
    const ns = 'load("schemas-k8s:v1.31/apps/v1.star", k8s="*")\n';
    // offset inside the k8s identifier
    const offset = ns.indexOf("k8s=") + 1;
    const result = findLoadArgumentAtPosition(ns, offset);
    expect(result).toEqual({
      kind: "namespace",
      name: "k8s",
      ociRef: "schemas-k8s:v1.31",
      tarEntryPath: "apps/v1.star",
    });
  });

  it("returns undefined when cursor is inside the path string (first argument)", () => {
    const offset = sample.indexOf("schemas-k8s"); // inside first arg
    expect(findLoadArgumentAtPosition(sample, offset)).toBeUndefined();
  });

  it("returns undefined when cursor is outside any load() call", () => {
    const text = 'x = 1\nload("schemas-k8s:v1.31/apps/v1.star", "Account")\n';
    // offset at 'x' position — outside load
    expect(findLoadArgumentAtPosition(text, 0)).toBeUndefined();
  });
});

describe("LoadDefinitionProvider", () => {
  let tmpDir: string;
  let cacheDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "load-def-test-"));
    cacheDir = path.join(tmpDir, "cache");
    fs.mkdirSync(cacheDir, { recursive: true });

    // Create a fixture cache structure: <cache>/schemas-k8s/v1.31/apps/v1.star
    const starDir = path.join(cacheDir, "schemas-k8s", "v1.31", "apps");
    fs.mkdirSync(starDir, { recursive: true });
    const starContent = [
      "# header comment",
      "",
      "def Account(spec):",
      "    pass",
      "",
      "def Deployment(spec):",
      "    pass",
    ].join("\n");
    fs.writeFileSync(path.join(starDir, "v1.star"), starContent, "utf-8");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function buildIndex(): SchemaIndex {
    const idx = new SchemaIndex();
    idx.buildFromCache(cacheDir);
    return idx;
  }

  it("returns Location for cursor on symbol string inside load()", () => {
    const idx = buildIndex();
    const provider = new LoadDefinitionProvider(idx);
    const text =
      'load("schemas-k8s:v1.31/apps/v1.star", "Account")\nd = Account(spec="x")\n';
    const doc = createMockDocument(text);
    const accountQuoteOffset = text.indexOf('"Account"') + 2;
    const pos = doc.positionAt(accountQuoteOffset);

    const result = provider.provideDefinition(
      doc,
      pos,
      {} as vscode.CancellationToken,
    );
    expect(result).toBeDefined();
    const loc = result as vscode.Location;
    expect(loc.uri.fsPath).toBe(
      path.join(cacheDir, "schemas-k8s", "v1.31", "apps", "v1.star"),
    );
    // def Account is on line 2 in the fixture above
    expect(loc.range.start.line).toBe(2);
    expect(loc.range.start.character).toBe(0);
  });

  it("returns Location for cursor on identifier usage that was imported via load()", () => {
    const idx = buildIndex();
    const provider = new LoadDefinitionProvider(idx);
    const text =
      'load("schemas-k8s:v1.31/apps/v1.star", "Account")\nd = Account(spec="x")\n';
    const doc = createMockDocument(text);
    // cursor on 'Account' in the usage line
    const usageOffset = text.indexOf("Account(");
    const pos = doc.positionAt(usageOffset + 2);

    const result = provider.provideDefinition(
      doc,
      pos,
      {} as vscode.CancellationToken,
    );
    expect(result).toBeDefined();
    const loc = result as vscode.Location;
    expect(loc.uri.fsPath).toBe(
      path.join(cacheDir, "schemas-k8s", "v1.31", "apps", "v1.star"),
    );
    expect(loc.range.start.line).toBe(2);
  });

  it("returns undefined for unknown identifier", () => {
    const idx = buildIndex();
    const provider = new LoadDefinitionProvider(idx);
    const text =
      'load("schemas-k8s:v1.31/apps/v1.star", "Account")\nm = Mystery(x=1)\n';
    const doc = createMockDocument(text);
    const usageOffset = text.indexOf("Mystery(");
    const pos = doc.positionAt(usageOffset + 2);

    const result = provider.provideDefinition(
      doc,
      pos,
      {} as vscode.CancellationToken,
    );
    expect(result).toBeUndefined();
  });

  it("returns undefined for cursor on path string (first load argument)", () => {
    const idx = buildIndex();
    const provider = new LoadDefinitionProvider(idx);
    const text =
      'load("schemas-k8s:v1.31/apps/v1.star", "Account")\n';
    const doc = createMockDocument(text);
    const pathOffset = text.indexOf("schemas-k8s"); // inside the path string
    const pos = doc.positionAt(pathOffset);

    const result = provider.provideDefinition(
      doc,
      pos,
      {} as vscode.CancellationToken,
    );
    expect(result).toBeUndefined();
  });

  it("returns undefined when cache file has been deleted after indexing", () => {
    const idx = buildIndex();
    const provider = new LoadDefinitionProvider(idx);
    const text =
      'load("schemas-k8s:v1.31/apps/v1.star", "Account")\nd = Account(x=1)\n';
    const doc = createMockDocument(text);

    // Delete the underlying .star file AFTER building the index.
    fs.rmSync(
      path.join(cacheDir, "schemas-k8s", "v1.31", "apps", "v1.star"),
      { force: true },
    );

    const usageOffset = text.indexOf("Account(");
    const pos = doc.positionAt(usageOffset + 2);
    const result = provider.provideDefinition(
      doc,
      pos,
      {} as vscode.CancellationToken,
    );
    expect(result).toBeUndefined();
  });
});
