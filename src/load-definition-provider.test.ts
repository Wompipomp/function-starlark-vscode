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

  it("resolves to the version named in the load() statement when multiple versions are cached", () => {
    // Two cached versions of the same artifact; each file exports the same
    // symbol on a different line so we can tell which version was resolved.
    const v1Dir = path.join(cacheDir, "stdlib", "v1.1.1");
    const v2Dir = path.join(cacheDir, "stdlib", "v1.6.3");
    fs.mkdirSync(v1Dir, { recursive: true });
    fs.mkdirSync(v2Dir, { recursive: true });
    // In v1.1.1, `shared` is defined on line 0.
    fs.writeFileSync(
      path.join(v1Dir, "mod.star"),
      "def shared(x):\n    pass\n",
      "utf-8",
    );
    // In v1.6.3, `shared` is defined on line 3 (preceded by padding).
    fs.writeFileSync(
      path.join(v2Dir, "mod.star"),
      ["# v1.6.3", "", "", "def shared(x):", "    pass", ""].join("\n"),
      "utf-8",
    );

    const idx = buildIndex();
    const provider = new LoadDefinitionProvider(idx);
    const text =
      'load("stdlib:v1.6.3/mod.star", "shared")\nshared(x=1)\n';
    const doc = createMockDocument(text);

    // Cursor on the "shared" string inside load() — must resolve to v1.6.3.
    const sharedInLoad = text.indexOf('"shared"') + 2;
    const loadHit = provider.provideDefinition(
      doc,
      doc.positionAt(sharedInLoad),
      {} as vscode.CancellationToken,
    ) as vscode.Location;
    expect(loadHit.uri.fsPath).toBe(path.join(v2Dir, "mod.star"));
    expect(loadHit.range.start.line).toBe(3);

    // Cursor on the usage — must also resolve to v1.6.3 (not whichever
    // version happens to win the symbol-keyed reverse index).
    const usage = text.indexOf("shared(x=1)") + 2;
    const usageHit = provider.provideDefinition(
      doc,
      doc.positionAt(usage),
      {} as vscode.CancellationToken,
    ) as vscode.Location;
    expect(usageHit.uri.fsPath).toBe(path.join(v2Dir, "mod.star"));
    expect(usageHit.range.start.line).toBe(3);
  });

  it("returns undefined for identifier under cursor when not imported by any load() in this file", () => {
    const idx = buildIndex();
    const provider = new LoadDefinitionProvider(idx);
    // File imports Account only; usage of Deployment is NOT imported here.
    // Provider must decline (upstream LSP handles local defs, and picking
    // the symbol from the index unconditionally would leak cross-file).
    const text =
      'load("schemas-k8s:v1.31/apps/v1.star", "Account")\nDeployment(x=1)\n';
    const doc = createMockDocument(text);
    const offset = text.indexOf("Deployment(") + 2;
    const result = provider.provideDefinition(
      doc,
      doc.positionAt(offset),
      {} as vscode.CancellationToken,
    );
    expect(result).toBeUndefined();
  });

  it("resolves star import (\"*\") on the load-argument to the target file at line 0", () => {
    const idx = buildIndex();
    const provider = new LoadDefinitionProvider(idx);
    const text =
      'load("schemas-k8s:v1.31/apps/v1.star", "*")\n';
    const doc = createMockDocument(text);
    const offset = text.indexOf('"*"') + 1;
    const result = provider.provideDefinition(
      doc,
      doc.positionAt(offset),
      {} as vscode.CancellationToken,
    ) as vscode.Location;
    expect(result).toBeDefined();
    expect(result.uri.fsPath).toBe(
      path.join(cacheDir, "schemas-k8s", "v1.31", "apps", "v1.star"),
    );
    expect(result.range.start.line).toBe(0);
  });

  it("resolves a usage identifier brought into scope by a star import", () => {
    const idx = buildIndex();
    const provider = new LoadDefinitionProvider(idx);
    const text =
      'load("schemas-k8s:v1.31/apps/v1.star", "*")\nDeployment(spec="x")\n';
    const doc = createMockDocument(text);
    const offset = text.indexOf("Deployment(") + 2;
    const result = provider.provideDefinition(
      doc,
      doc.positionAt(offset),
      {} as vscode.CancellationToken,
    ) as vscode.Location;
    expect(result).toBeDefined();
    expect(result.uri.fsPath).toBe(
      path.join(cacheDir, "schemas-k8s", "v1.31", "apps", "v1.star"),
    );
    // Deployment is at line 5 in the fixture in beforeEach.
    expect(result.range.start.line).toBe(5);
  });

  it("star import does not resolve symbols the target file does not export", () => {
    const idx = buildIndex();
    const provider = new LoadDefinitionProvider(idx);
    const text =
      'load("schemas-k8s:v1.31/apps/v1.star", "*")\nMystery(x=1)\n';
    const doc = createMockDocument(text);
    const offset = text.indexOf("Mystery(") + 2;
    const result = provider.provideDefinition(
      doc,
      doc.positionAt(offset),
      {} as vscode.CancellationToken,
    );
    expect(result).toBeUndefined();
  });

  it("resolves full-URI OCI references (ghcr.io/...) via ociRefToCacheKey", () => {
    // Fixture: simulate what the downloader does for a full-URI load.
    // The cache uses the LAST segment of the repository + tag, so this maps
    // onto `starlark-stdlib/v2/naming.star` regardless of the registry host.
    const stdlibDir = path.join(cacheDir, "starlark-stdlib", "v2");
    fs.mkdirSync(stdlibDir, { recursive: true });
    fs.writeFileSync(
      path.join(stdlibDir, "naming.star"),
      ["# stdlib naming helpers", "", "def camelcase(s):", "    return s"].join(
        "\n",
      ),
      "utf-8",
    );

    const idx = buildIndex();
    const provider = new LoadDefinitionProvider(idx);
    const text =
      'load("oci://ghcr.io/wompipomp/starlark-stdlib:v2/naming.star", "*")\n' +
      'x = camelcase("foo")\n';
    const doc = createMockDocument(text);

    // 1. Cursor on the star in load() — jumps to file at line 0.
    const starOffset = text.indexOf('"*"') + 1;
    const starHit = provider.provideDefinition(
      doc,
      doc.positionAt(starOffset),
      {} as vscode.CancellationToken,
    ) as vscode.Location;
    expect(starHit.uri.fsPath).toBe(path.join(stdlibDir, "naming.star"));
    expect(starHit.range.start.line).toBe(0);

    // 2. Cursor on `camelcase` usage — resolves via star import per-file lookup.
    const usageOffset = text.indexOf("camelcase(") + 2;
    const usageHit = provider.provideDefinition(
      doc,
      doc.positionAt(usageOffset),
      {} as vscode.CancellationToken,
    ) as vscode.Location;
    expect(usageHit.uri.fsPath).toBe(path.join(stdlibDir, "naming.star"));
    expect(usageHit.range.start.line).toBe(2);
  });

  it("resolves ACR-hosted (registry.example.com) full-URI load with star import", () => {
    const stdlibDir = path.join(cacheDir, "starlark-stdlib", "v1.6.3");
    fs.mkdirSync(stdlibDir, { recursive: true });
    fs.writeFileSync(
      path.join(stdlibDir, "iam.star"),
      ["# iam helpers", "", "def iam_role(name):", "    return name"].join("\n"),
      "utf-8",
    );

    const idx = buildIndex();
    const provider = new LoadDefinitionProvider(idx);
    const text =
      'load("oci://registry.example.com/starlark-stdlib:v1.6.3/iam.star", "*")\n' +
      'r = iam_role("admin")\n';
    const doc = createMockDocument(text);

    // Star argument inside load() — jump to file at line 0.
    const starOffset = text.indexOf('"*"') + 1;
    const starHit = provider.provideDefinition(
      doc,
      doc.positionAt(starOffset),
      {} as vscode.CancellationToken,
    ) as vscode.Location;
    expect(starHit.uri.fsPath).toBe(path.join(stdlibDir, "iam.star"));
    expect(starHit.range.start.line).toBe(0);

    // Usage identifier — resolves via star-import per-file lookup.
    const usageOffset = text.indexOf("iam_role(") + 2;
    const usageHit = provider.provideDefinition(
      doc,
      doc.positionAt(usageOffset),
      {} as vscode.CancellationToken,
    ) as vscode.Location;
    expect(usageHit.uri.fsPath).toBe(path.join(stdlibDir, "iam.star"));
    expect(usageHit.range.start.line).toBe(2);
  });

  it("resolves a usage when the target is a top-level assignment (not def/schema)", () => {
    // Mirrors stdlib patterns like:
    //   kcl_generate_name = kcl.make_invocation("generate_name")
    // which is neither `def` nor `schema(` — the pre-widening provider would
    // miss it because SchemaIndex.extractTopLevelDefs only catches those two.
    const platformDir = path.join(cacheDir, "starlark-stdlib", "v1.6.3");
    fs.mkdirSync(platformDir, { recursive: true });
    fs.writeFileSync(
      path.join(platformDir, "platform.star"),
      [
        "# platform helpers",
        "",
        "_kcl = struct(make_invocation=lambda n: n)",
        "",
        'kcl_generate_name = _kcl.make_invocation("generate_name")',
        'kcl_normalize_k8s_resource_name = _kcl.make_invocation("normalize")',
      ].join("\n"),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(platformDir, "iam.star"),
      "# iam helpers\n\ndef iam_role(name):\n    return name\n",
      "utf-8",
    );

    const idx = buildIndex();
    const provider = new LoadDefinitionProvider(idx);
    const text =
      'load("oci://registry.example.com/starlark-stdlib:v1.6.3/platform.star", "*")\n' +
      'load("oci://registry.example.com/starlark-stdlib:v1.6.3/iam.star", "*")\n' +
      "resolver_key = kcl_generate_name(_PREFIX)\n" +
      'env_key = kcl_normalize_k8s_resource_name("%s-env" % xr_name)\n';
    const doc = createMockDocument(text);

    const callOffset = text.indexOf("kcl_generate_name(") + 2;
    const callHit = provider.provideDefinition(
      doc,
      doc.positionAt(callOffset),
      {} as vscode.CancellationToken,
    ) as vscode.Location;
    expect(callHit).toBeDefined();
    expect(callHit.uri.fsPath).toBe(path.join(platformDir, "platform.star"));
    expect(callHit.range.start.line).toBe(4);

    const normOffset = text.indexOf("kcl_normalize_k8s_resource_name(") + 2;
    const normHit = provider.provideDefinition(
      doc,
      doc.positionAt(normOffset),
      {} as vscode.CancellationToken,
    ) as vscode.Location;
    expect(normHit).toBeDefined();
    expect(normHit.uri.fsPath).toBe(path.join(platformDir, "platform.star"));
    expect(normHit.range.start.line).toBe(5);
  });

  it("does not misattribute same-prefix identifiers when resolving top-level bindings", () => {
    // Guard against a naive regex like /^foo\s*=/ accidentally matching
    // `foo_bar = ...` when searching for `foo`.
    const dir = path.join(cacheDir, "prefix-test", "v1");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "mod.star"),
      ["foo_bar = 1", "foo = 2", ""].join("\n"),
      "utf-8",
    );
    const idx = buildIndex();
    const provider = new LoadDefinitionProvider(idx);
    const text =
      'load("prefix-test:v1/mod.star", "*")\nuse = foo\n';
    const doc = createMockDocument(text);
    const offset = text.indexOf("= foo\n") + 2;
    const hit = provider.provideDefinition(
      doc,
      doc.positionAt(offset),
      {} as vscode.CancellationToken,
    ) as vscode.Location;
    expect(hit.range.start.line).toBe(1); // `foo = 2` on line 1, not `foo_bar = 1` on line 0
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
