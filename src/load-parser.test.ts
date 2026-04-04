import { describe, it, expect } from "vitest";
import {
  parseLoadStatements,
  isOciLoadPath,
  splitOciPath,
  resolveOciRef,
  ociRefToCacheKey,
} from "./load-parser";

describe("isOciLoadPath", () => {
  it('returns true for short OCI path "schemas-k8s:v1.31/apps/v1.star"', () => {
    expect(isOciLoadPath("schemas-k8s:v1.31/apps/v1.star")).toBe(true);
  });

  it('returns true for full OCI URI "ghcr.io/org/schemas:v2.0/path/file.star"', () => {
    expect(isOciLoadPath("ghcr.io/org/schemas:v2.0/path/file.star")).toBe(true);
  });

  it('returns false for Bazel label "//lib:utils.star"', () => {
    expect(isOciLoadPath("//lib:utils.star")).toBe(false);
  });

  it('returns false for path without .star extension "schemas-k8s:v1.31/apps/v1"', () => {
    expect(isOciLoadPath("schemas-k8s:v1.31/apps/v1")).toBe(false);
  });

  it('returns false for incomplete path "schemas-k8s:v1.31" (no slash after tag)', () => {
    expect(isOciLoadPath("schemas-k8s:v1.31")).toBe(false);
  });

  it("returns false for relative path without colon", () => {
    expect(isOciLoadPath("lib/utils.star")).toBe(false);
  });

  it("returns false for oci:// prefixed path (prefix stripping is parseLoadStatements' job)", () => {
    expect(isOciLoadPath("oci://myregistry.azurecr.io/starlark-stdlib:v1.0.3/naming.star")).toBe(false);
  });
});

describe("splitOciPath", () => {
  it("splits short path into ociRef and tarEntryPath", () => {
    expect(splitOciPath("schemas-k8s:v1.31/apps/v1.star")).toEqual({
      ociRef: "schemas-k8s:v1.31",
      tarEntryPath: "apps/v1.star",
    });
  });

  it("splits full OCI URI into ociRef and tarEntryPath", () => {
    expect(splitOciPath("ghcr.io/org/schemas:v2.0/path/file.star")).toEqual({
      ociRef: "ghcr.io/org/schemas:v2.0",
      tarEntryPath: "path/file.star",
    });
  });

  it("handles deeply nested tar entry paths", () => {
    expect(splitOciPath("schemas-k8s:v1.31/apps/v1/nested/file.star")).toEqual({
      ociRef: "schemas-k8s:v1.31",
      tarEntryPath: "apps/v1/nested/file.star",
    });
  });
});

describe("resolveOciRef", () => {
  it("resolves short path using default registry", () => {
    expect(resolveOciRef("schemas-k8s:v1.31", "ghcr.io/wompipomp")).toEqual({
      registryHost: "ghcr.io",
      repository: "wompipomp/schemas-k8s",
      tag: "v1.31",
    });
  });

  it("resolves full OCI URI ignoring default registry", () => {
    expect(resolveOciRef("ghcr.io/org/schemas:v2.0", "ghcr.io/wompipomp")).toEqual({
      registryHost: "ghcr.io",
      repository: "org/schemas",
      tag: "v2.0",
    });
  });

  it("handles registry with nested path", () => {
    expect(resolveOciRef("schemas-k8s:v1.31", "ghcr.io/myorg/sub")).toEqual({
      registryHost: "ghcr.io",
      repository: "myorg/sub/schemas-k8s",
      tag: "v1.31",
    });
  });
});

describe("ociRefToCacheKey", () => {
  it("returns artifactName/tag for short ref", () => {
    expect(ociRefToCacheKey("schemas-k8s:v1.31")).toBe("schemas-k8s/v1.31");
  });

  it("strips registry prefix for full URI", () => {
    expect(ociRefToCacheKey("ghcr.io/wompipomp/schemas-k8s:v1.35")).toBe("schemas-k8s/v1.35");
  });

  it("strips nested registry path for full URI", () => {
    expect(ociRefToCacheKey("ghcr.io/org/sub/schemas:v2.0")).toBe("schemas/v2.0");
  });
});

describe("parseLoadStatements", () => {
  it("parses single load with one symbol", () => {
    const text = 'load("schemas-k8s:v1.31/apps/v1.star", "Deployment")';
    const result = parseLoadStatements(text);
    expect(result).toEqual([
      {
        ociRef: "schemas-k8s:v1.31",
        tarEntryPath: "apps/v1.star",
        symbols: ["Deployment"],
        namespaces: [],
        fullPath: "schemas-k8s:v1.31/apps/v1.star",
      },
    ]);
  });

  it("parses load with multiple symbols", () => {
    const text = 'load("schemas-k8s:v1.31/apps/v1.star", "Deployment", "StatefulSet")';
    const result = parseLoadStatements(text);
    expect(result).toHaveLength(1);
    expect(result[0].symbols).toEqual(["Deployment", "StatefulSet"]);
  });

  it("parses load with star import", () => {
    const text = 'load("schemas-k8s:v1.31/apps/v1.star", "*")';
    const result = parseLoadStatements(text);
    expect(result).toHaveLength(1);
    expect(result[0].symbols).toEqual(["*"]);
  });

  it("parses load with full OCI URI", () => {
    const text = 'load("ghcr.io/org/schemas:v2.0/path/file.star", "Foo")';
    const result = parseLoadStatements(text);
    expect(result).toHaveLength(1);
    expect(result[0].ociRef).toBe("ghcr.io/org/schemas:v2.0");
    expect(result[0].tarEntryPath).toBe("path/file.star");
    expect(result[0].fullPath).toBe("ghcr.io/org/schemas:v2.0/path/file.star");
  });

  it("ignores non-OCI paths", () => {
    const text = 'load("//lib:utils.star", "helper")';
    const result = parseLoadStatements(text);
    expect(result).toEqual([]);
  });

  it("ignores paths without .star extension", () => {
    const text = 'load("schemas-k8s:v1.31/apps/v1", "Deployment")';
    const result = parseLoadStatements(text);
    expect(result).toEqual([]);
  });

  it("ignores incomplete paths (no slash after tag)", () => {
    const text = 'load("schemas-k8s", "Deployment")';
    const result = parseLoadStatements(text);
    expect(result).toEqual([]);
  });

  it("handles multiple load statements in one file", () => {
    const text = `
load("schemas-k8s:v1.31/apps/v1.star", "Deployment")
load("schemas-k8s:v1.31/core/v1.star", "Service", "ConfigMap")
`;
    const result = parseLoadStatements(text);
    expect(result).toHaveLength(2);
    expect(result[0].symbols).toEqual(["Deployment"]);
    expect(result[1].symbols).toEqual(["Service", "ConfigMap"]);
  });

  it("ignores load with no symbols", () => {
    const text = 'load("schemas-k8s:v1.31/apps/v1.star")';
    const result = parseLoadStatements(text);
    expect(result).toEqual([]);
  });

  it("handles mixed OCI and non-OCI load statements", () => {
    const text = `
load("//lib:utils.star", "helper")
load("schemas-k8s:v1.31/apps/v1.star", "Deployment")
load("relative/path.star", "something")
`;
    const result = parseLoadStatements(text);
    expect(result).toHaveLength(1);
    expect(result[0].symbols).toEqual(["Deployment"]);
  });

  it("parses namespace import k8s=\"*\"", () => {
    const text = 'load("schemas-k8s:v1.31/apps/v1.star", k8s="*")';
    const result = parseLoadStatements(text);
    expect(result).toHaveLength(1);
    expect(result[0].symbols).toEqual([]);
    expect(result[0].namespaces).toEqual([{ name: "k8s", value: "*" }]);
    expect(result[0].ociRef).toBe("schemas-k8s:v1.31");
  });

  it("parses mixed direct and namespace imports", () => {
    const text = 'load("schemas-k8s:v1.31/apps/v1.star", "Deployment", k8s="*")';
    const result = parseLoadStatements(text);
    expect(result).toHaveLength(1);
    expect(result[0].symbols).toEqual(["Deployment"]);
    expect(result[0].namespaces).toEqual([{ name: "k8s", value: "*" }]);
  });

  it("parses multiple namespace imports", () => {
    const text = 'load("schemas-k8s:v1.31/apps/v1.star", apps="*", k8s="*")';
    const result = parseLoadStatements(text);
    expect(result).toHaveLength(1);
    expect(result[0].namespaces).toHaveLength(2);
    expect(result[0].namespaces[0]).toEqual({ name: "apps", value: "*" });
    expect(result[0].namespaces[1]).toEqual({ name: "k8s", value: "*" });
  });

  it("treats load with only namespace import as valid (not skipped)", () => {
    const text = 'load("schemas-k8s:v1.31/apps/v1.star", storage="*")';
    const result = parseLoadStatements(text);
    expect(result).toHaveLength(1);
  });

  it("parses load with oci:// prefix on full registry path", () => {
    const text = 'load("oci://myregistry.azurecr.io/starlark-stdlib:v1.0.3/naming.star", "resource_name")';
    const result = parseLoadStatements(text);
    expect(result).toEqual([
      {
        ociRef: "myregistry.azurecr.io/starlark-stdlib:v1.0.3",
        tarEntryPath: "naming.star",
        symbols: ["resource_name"],
        namespaces: [],
        fullPath: "oci://myregistry.azurecr.io/starlark-stdlib:v1.0.3/naming.star",
      },
    ]);
  });

  it("parses load with oci:// prefix on short path", () => {
    const text = 'load("oci://schemas-k8s:v1.31/apps/v1.star", "Deployment")';
    const result = parseLoadStatements(text);
    expect(result).toEqual([
      {
        ociRef: "schemas-k8s:v1.31",
        tarEntryPath: "apps/v1.star",
        symbols: ["Deployment"],
        namespaces: [],
        fullPath: "oci://schemas-k8s:v1.31/apps/v1.star",
      },
    ]);
  });

  it("parses load with oci:// prefix and namespace import", () => {
    const text = 'load("oci://ghcr.io/org/schemas:v2.0/path/file.star", k8s="*")';
    const result = parseLoadStatements(text);
    expect(result).toHaveLength(1);
    expect(result[0].ociRef).toBe("ghcr.io/org/schemas:v2.0");
    expect(result[0].tarEntryPath).toBe("path/file.star");
    expect(result[0].namespaces).toEqual([{ name: "k8s", value: "*" }]);
    expect(result[0].fullPath).toBe("oci://ghcr.io/org/schemas:v2.0/path/file.star");
  });

  it("handles mix of oci:// prefixed and non-prefixed loads", () => {
    const text = `
load("oci://myregistry.azurecr.io/starlark-stdlib:v1.0.3/naming.star", "resource_name")
load("schemas-k8s:v1.31/apps/v1.star", "Deployment")
`;
    const result = parseLoadStatements(text);
    expect(result).toHaveLength(2);
    expect(result[0].fullPath).toBe("oci://myregistry.azurecr.io/starlark-stdlib:v1.0.3/naming.star");
    expect(result[0].ociRef).toBe("myregistry.azurecr.io/starlark-stdlib:v1.0.3");
    expect(result[1].fullPath).toBe("schemas-k8s:v1.31/apps/v1.star");
    expect(result[1].ociRef).toBe("schemas-k8s:v1.31");
  });
});
