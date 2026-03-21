import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  BUILTIN_NAMES,
  extractTopLevelDefs,
  SchemaIndex,
} from "./schema-index";

// Mock fs module
vi.mock("fs", () => ({
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
  statSync: vi.fn(),
}));

import * as fs from "fs";

const mockedReaddirSync = vi.mocked(fs.readdirSync);
const mockedReadFileSync = vi.mocked(fs.readFileSync);
const mockedStatSync = vi.mocked(fs.statSync);

describe("BUILTIN_NAMES", () => {
  it("contains exactly 21 builtin names", () => {
    expect(BUILTIN_NAMES.size).toBe(21);
  });

  it("contains all builtin function names", () => {
    const functions = [
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
    ];
    for (const fn of functions) {
      expect(BUILTIN_NAMES.has(fn), `missing builtin function: ${fn}`).toBe(
        true,
      );
    }
  });

  it("contains all builtin variable names", () => {
    const variables = [
      "oxr",
      "dxr",
      "observed",
      "context",
      "environment",
      "extra_resources",
    ];
    for (const v of variables) {
      expect(BUILTIN_NAMES.has(v), `missing builtin variable: ${v}`).toBe(
        true,
      );
    }
  });

  it("is a ReadonlySet (immutable)", () => {
    // ReadonlySet has no add/delete/clear methods at compile time;
    // at runtime the underlying Set still has them, but the exported type
    // should prevent accidental mutation in consuming code.
    expect(BUILTIN_NAMES).toBeInstanceOf(Set);
  });
});

describe("extractTopLevelDefs", () => {
  it("extracts a single top-level def", () => {
    const content = "def Deployment(name, replicas=1):\n  pass";
    expect(extractTopLevelDefs(content)).toEqual(new Set(["Deployment"]));
  });

  it("extracts a schema() assignment", () => {
    const content = 'Deployment = schema("Deployment", replicas=field())';
    expect(extractTopLevelDefs(content)).toEqual(new Set(["Deployment"]));
  });

  it("extracts multiple defs and schema assignments", () => {
    const content = [
      "def Deployment(name, replicas=1):",
      "  pass",
      "",
      'Service = schema("Service", port=field())',
      "",
      "def ConfigMap(name, data):",
      "  pass",
    ].join("\n");
    expect(extractTopLevelDefs(content)).toEqual(
      new Set(["Deployment", "Service", "ConfigMap"]),
    );
  });

  it("ignores indented defs (only top-level)", () => {
    const content = [
      "def TopLevel():",
      "  def inner_helper():",
      "    pass",
      "  pass",
    ].join("\n");
    expect(extractTopLevelDefs(content)).toEqual(new Set(["TopLevel"]));
  });

  it("returns empty set for content with no defs", () => {
    const content = '# just a comment\nload("something", "foo")\n';
    expect(extractTopLevelDefs(content)).toEqual(new Set());
  });
});

describe("SchemaIndex", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  function setupMockFS(
    files: Record<string, string>,
    cacheDir: string,
  ): void {
    // Build the directory tree structure from file paths
    const dirs = new Map<string, string[]>();

    // Add the root
    dirs.set(cacheDir, []);

    for (const filePath of Object.keys(files)) {
      const fullPath = `${cacheDir}/${filePath}`;
      const parts = filePath.split("/");

      // Register each directory level
      let currentDir = cacheDir;
      for (let i = 0; i < parts.length - 1; i++) {
        const dirName = parts[i];
        if (!dirs.has(currentDir)) {
          dirs.set(currentDir, []);
        }
        if (!dirs.get(currentDir)!.includes(dirName)) {
          dirs.get(currentDir)!.push(dirName);
        }
        currentDir = `${currentDir}/${dirName}`;
      }

      // Register the file in its parent directory
      const fileName = parts[parts.length - 1];
      if (!dirs.has(currentDir)) {
        dirs.set(currentDir, []);
      }
      if (!dirs.get(currentDir)!.includes(fileName)) {
        dirs.get(currentDir)!.push(fileName);
      }

      // Store full path for file reading
      files[filePath] = files[filePath]; // no change, just for clarity
    }

    mockedReaddirSync.mockImplementation((dirPath: unknown) => {
      const p = String(dirPath);
      return (dirs.get(p) ?? []) as unknown as ReturnType<
        typeof fs.readdirSync
      >;
    });

    mockedStatSync.mockImplementation((filePath: unknown) => {
      const p = String(filePath);
      // Check if it's a directory
      const isDir = dirs.has(p);
      return {
        isDirectory: () => isDir,
        isFile: () => !isDir,
      } as fs.Stats;
    });

    mockedReadFileSync.mockImplementation((filePath: unknown) => {
      const p = String(filePath);
      const rel = p.startsWith(cacheDir + "/")
        ? p.substring(cacheDir.length + 1)
        : p;
      if (rel in files) {
        return files[rel];
      }
      throw new Error(`ENOENT: ${p}`);
    });
  }

  it("builds index from cache directory", () => {
    const cacheDir = "/tmp/schemas";
    setupMockFS(
      {
        "schemas-k8s/v1.31/apps/v1.star": [
          "def Deployment(name, replicas=1):",
          "  pass",
          "",
          "def StatefulSet(name, replicas=1):",
          "  pass",
        ].join("\n"),
        "schemas-k8s/v1.31/core/v1.star": [
          'Service = schema("Service", port=field())',
          "",
          'ConfigMap = schema("ConfigMap", data=field())',
        ].join("\n"),
      },
      cacheDir,
    );

    const index = new SchemaIndex();
    index.buildFromCache(cacheDir);

    const appsSymbols = index.getSymbolsForFile(
      "schemas-k8s/v1.31/apps/v1.star",
    );
    expect(appsSymbols).toEqual(new Set(["Deployment", "StatefulSet"]));

    const coreSymbols = index.getSymbolsForFile(
      "schemas-k8s/v1.31/core/v1.star",
    );
    expect(coreSymbols).toEqual(new Set(["Service", "ConfigMap"]));
  });

  it("getSymbolsForFile returns empty set for unknown files", () => {
    const index = new SchemaIndex();
    expect(index.getSymbolsForFile("nonexistent/file.star")).toEqual(
      new Set(),
    );
  });

  it("getAllSymbols returns the union of all symbols", () => {
    const cacheDir = "/tmp/schemas";
    setupMockFS(
      {
        "schemas-k8s/v1.31/apps/v1.star":
          "def Deployment(name):\n  pass",
        "schemas-k8s/v1.31/core/v1.star":
          'Service = schema("Service")',
      },
      cacheDir,
    );

    const index = new SchemaIndex();
    index.buildFromCache(cacheDir);

    const all = index.getAllSymbols();
    expect(all).toEqual(new Set(["Deployment", "Service"]));
  });

  it("rebuild re-scans the cache directory and updates the index", () => {
    const cacheDir = "/tmp/schemas";

    // Initial build with one file
    setupMockFS(
      {
        "schemas-k8s/v1.31/apps/v1.star":
          "def Deployment(name):\n  pass",
      },
      cacheDir,
    );

    const index = new SchemaIndex();
    index.buildFromCache(cacheDir);
    expect(index.getAllSymbols()).toEqual(new Set(["Deployment"]));

    // Rebuild with different content
    vi.resetAllMocks();
    setupMockFS(
      {
        "schemas-k8s/v1.31/apps/v1.star":
          "def Deployment(name):\n  pass\ndef ReplicaSet(name):\n  pass",
      },
      cacheDir,
    );

    index.rebuild(cacheDir);
    expect(index.getAllSymbols()).toEqual(
      new Set(["Deployment", "ReplicaSet"]),
    );
  });

  it("only indexes .star files (ignores other extensions)", () => {
    const cacheDir = "/tmp/schemas";
    setupMockFS(
      {
        "schemas-k8s/v1.31/apps/v1.star":
          "def Deployment(name):\n  pass",
        "schemas-k8s/v1.31/apps/README.md": "# Apps\n",
      },
      cacheDir,
    );

    const index = new SchemaIndex();
    index.buildFromCache(cacheDir);

    expect(index.getAllSymbols()).toEqual(new Set(["Deployment"]));
  });
});
