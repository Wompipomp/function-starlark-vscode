import { describe, it, expect, vi, beforeEach } from "vitest";
import * as vscode from "vscode";
import {
  formatDownloadFailure,
  findLoadRangesForOciRef,
  SchemaDownloadDiagnostics,
} from "./schema-download-diagnostics";
import { OciDownloadError } from "./oci/errors";

function mockDocument(text: string, uri = "file:///test.star"): vscode.TextDocument {
  return {
    uri: vscode.Uri.parse(uri),
    getText: () => text,
    positionAt: vi.fn(),
    offsetAt: vi.fn(),
  } as unknown as vscode.TextDocument;
}

function mockCollection() {
  const store = new Map<string, vscode.Diagnostic[]>();
  const coll = {
    set: vi.fn((uri: vscode.Uri, diags: vscode.Diagnostic[]) => {
      store.set(uri.toString(), diags);
    }),
    delete: vi.fn((uri: vscode.Uri) => {
      store.delete(uri.toString());
    }),
    clear: vi.fn(() => store.clear()),
    dispose: vi.fn(),
    _store: store,
  };
  return coll as unknown as vscode.DiagnosticCollection & {
    _store: Map<string, vscode.Diagnostic[]>;
  };
}

describe("formatDownloadFailure", () => {
  it("produces an auth-specific message including the registry host", () => {
    const err = new OciDownloadError({
      kind: "auth",
      message: "manifest 401 Unauthorized",
      registryHost: "registry.example.com",
      repository: "starlark-stdlib",
      tag: "v1.6.3",
      httpStatus: 401,
    });
    const msg = formatDownloadFailure(err);
    expect(msg).toContain("Authentication failed");
    expect(msg).toContain("registry.example.com");
    expect(msg).toContain("401");
    expect(msg).toContain("docker login");
  });

  it("produces a notFound-specific message with the full reference", () => {
    const err = new OciDownloadError({
      kind: "notFound",
      message: "manifest 404",
      registryHost: "ghcr.io",
      repository: "org/pkg",
      tag: "v9",
      httpStatus: 404,
    });
    const msg = formatDownloadFailure(err);
    expect(msg).toContain("not found");
    expect(msg).toContain("ghcr.io/org/pkg:v9");
  });

  it("produces a network-specific message for fetch rejections", () => {
    const err = new OciDownloadError({
      kind: "network",
      message: "Network error reaching host: ECONNREFUSED",
      registryHost: "registry.private.corp",
      repository: "p",
      tag: "t",
    });
    const msg = formatDownloadFailure(err);
    expect(msg).toContain("Network error");
    expect(msg).toContain("registry.private.corp");
  });
});

describe("findLoadRangesForOciRef", () => {
  it("returns the range of the matching load() call", () => {
    const text =
      'load("oci://registry.example.com/starlark-stdlib:v1.6.3/iam.star", "*")\n';
    const ranges = findLoadRangesForOciRef(
      text,
      "registry.example.com/starlark-stdlib:v1.6.3",
    );
    expect(ranges).toHaveLength(1);
    expect(ranges[0].start.line).toBe(0);
    expect(ranges[0].start.character).toBe(0);
    expect(ranges[0].end.line).toBe(0);
    // Range must span through the closing paren
    expect(text.substring(0, ranges[0].end.character)).toContain(')');
  });

  it("returns multiple ranges when the same ociRef appears twice", () => {
    const text =
      'load("oci://registry.example.com/starlark-stdlib:v1.6.3/iam.star", "*")\n' +
      'load("oci://registry.example.com/starlark-stdlib:v1.6.3/platform.star", "*")\n';
    const ranges = findLoadRangesForOciRef(
      text,
      "registry.example.com/starlark-stdlib:v1.6.3",
    );
    expect(ranges).toHaveLength(2);
    expect(ranges[0].start.line).toBe(0);
    expect(ranges[1].start.line).toBe(1);
  });

  it("does not match loads for a different tag", () => {
    const text =
      'load("oci://registry.example.com/starlark-stdlib:v1.1.1/iam.star", "*")\n' +
      'load("oci://registry.example.com/starlark-stdlib:v1.6.3/iam.star", "*")\n';
    const ranges = findLoadRangesForOciRef(
      text,
      "registry.example.com/starlark-stdlib:v1.6.3",
    );
    expect(ranges).toHaveLength(1);
    expect(ranges[0].start.line).toBe(1);
  });

  it("returns empty when no load() matches", () => {
    const text = 'load("schemas-k8s:v1.31/apps/v1.star", "*")\n';
    const ranges = findLoadRangesForOciRef(text, "missing:v1");
    expect(ranges).toEqual([]);
  });
});

describe("SchemaDownloadDiagnostics", () => {
  let coll: ReturnType<typeof mockCollection>;
  let diag: SchemaDownloadDiagnostics;

  beforeEach(() => {
    coll = mockCollection();
    diag = new SchemaDownloadDiagnostics(coll);
    // @ts-expect-error test-only mutation
    vscode.workspace.textDocuments = [];
  });

  function authErr(ociRef: string): OciDownloadError {
    const [name, tag] = ociRef.split(":");
    return new OciDownloadError({
      kind: "auth",
      message: "401",
      registryHost: "registry.example.com",
      repository: name,
      tag: tag ?? "unknown",
      httpStatus: 401,
    });
  }

  it("reportFailure sets a diagnostic on the matching load() range", () => {
    const doc = mockDocument(
      'load("oci://registry.example.com/starlark-stdlib:v1.6.3/iam.star", "*")\n',
    );
    diag.reportFailure(
      doc,
      "registry.example.com/starlark-stdlib:v1.6.3",
      authErr("registry.example.com/starlark-stdlib:v1.6.3"),
    );

    const stored = coll._store.get(doc.uri.toString());
    expect(stored).toBeDefined();
    expect(stored).toHaveLength(1);
    expect(stored![0].message).toContain("Authentication failed");
    expect(stored![0].severity).toBe(vscode.DiagnosticSeverity.Error);
    expect(stored![0].source).toBe("function-starlark");
    expect(stored![0].code).toBe("schema-download-failed");
  });

  it("clearFor removes the diagnostic from all tracked documents", () => {
    const doc = mockDocument(
      'load("oci://registry.example.com/starlark-stdlib:v1.6.3/iam.star", "*")\n',
    );
    // @ts-expect-error test-only mutation
    vscode.workspace.textDocuments = [doc];
    diag.reportFailure(
      doc,
      "registry.example.com/starlark-stdlib:v1.6.3",
      authErr("registry.example.com/starlark-stdlib:v1.6.3"),
    );
    expect(coll._store.get(doc.uri.toString())).toHaveLength(1);

    diag.clearFor("registry.example.com/starlark-stdlib:v1.6.3");
    expect(coll._store.get(doc.uri.toString())).toBeUndefined();
  });

  it("distinct ociRefs are tracked independently", () => {
    const doc = mockDocument(
      'load("oci://registry.example.com/starlark-stdlib:v1.1.1/x.star", "*")\n' +
        'load("oci://registry.example.com/starlark-stdlib:v1.6.3/x.star", "*")\n',
    );
    // @ts-expect-error test-only mutation
    vscode.workspace.textDocuments = [doc];

    diag.reportFailure(
      doc,
      "registry.example.com/starlark-stdlib:v1.1.1",
      authErr("registry.example.com/starlark-stdlib:v1.1.1"),
    );
    diag.reportFailure(
      doc,
      "registry.example.com/starlark-stdlib:v1.6.3",
      authErr("registry.example.com/starlark-stdlib:v1.6.3"),
    );
    expect(coll._store.get(doc.uri.toString())).toHaveLength(2);

    // Clearing only v1.6.3 should leave v1.1.1 in place.
    diag.clearFor("registry.example.com/starlark-stdlib:v1.6.3");
    const after = coll._store.get(doc.uri.toString())!;
    expect(after).toHaveLength(1);
    expect(after[0].range.start.line).toBe(0); // v1.1.1 was on line 0
  });

  it("forgetDocument removes state when a document is closed", () => {
    const doc = mockDocument(
      'load("oci://registry.example.com/p:v1/x.star", "*")\n',
    );
    diag.reportFailure(doc, "registry.example.com/p:v1", authErr("p:v1"));
    diag.forgetDocument(doc.uri);
    expect(coll._store.get(doc.uri.toString())).toBeUndefined();
    // Subsequent clearFor is a no-op without throwing.
    diag.clearFor("registry.example.com/p:v1");
  });

  it("refreshDocument drops state when the load() was removed from the text", () => {
    const doc = mockDocument(
      'load("oci://registry.example.com/p:v1/x.star", "*")\n',
    );
    // @ts-expect-error test-only mutation
    vscode.workspace.textDocuments = [doc];
    diag.reportFailure(doc, "registry.example.com/p:v1", authErr("p:v1"));
    expect(coll._store.get(doc.uri.toString())).toHaveLength(1);

    // Simulate the user deleting the load() line.
    const doc2 = mockDocument("\n", doc.uri.toString());
    diag.refreshDocument(doc2);
    expect(coll._store.get(doc2.uri.toString())).toBeUndefined();
  });
});
