import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import * as path from "path";

vi.mock("fs");
vi.mock("nanotar");
vi.mock("./client");
vi.mock("./auth");
vi.mock("../load-parser");

import * as fs from "fs";
import { parseTar } from "nanotar";
import { OciClient } from "./client";
import { getDockerCredentials } from "./auth";
import { resolveOciRef } from "../load-parser";
import { OciDownloader } from "./downloader";

// --- Helpers ---

const cacheDir = "/mock/cache";
const defaultRegistry = "ghcr.io/wompipomp";

function setupResolveOciRef(artifactName: string, tag: string) {
  (resolveOciRef as unknown as Mock).mockReturnValue({
    registryHost: "ghcr.io",
    repository: `wompipomp/${artifactName}`,
    tag,
  });
}

function setupMocks(opts: { cacheExists?: boolean; tarEntries?: Array<{ name: string; type?: string; data?: Uint8Array }> } = {}) {
  (fs.existsSync as unknown as Mock).mockReturnValue(opts.cacheExists ?? false);
  (fs.mkdirSync as unknown as Mock).mockReturnValue(undefined);
  (fs.writeFileSync as unknown as Mock).mockReturnValue(undefined);
  (fs.renameSync as unknown as Mock).mockReturnValue(undefined);
  (fs.rmSync as unknown as Mock).mockReturnValue(undefined);

  (getDockerCredentials as unknown as Mock).mockResolvedValue(undefined);

  const mockPullArtifact = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));
  (OciClient as unknown as Mock).mockImplementation(() => ({
    pullArtifact: mockPullArtifact,
  }));

  (parseTar as unknown as Mock).mockReturnValue(
    opts.tarEntries ?? [
      { name: "apps/v1.star", type: "file", data: new Uint8Array([10, 20]) },
      { name: "core/v1.star", type: "file", data: new Uint8Array([30, 40]) },
    ],
  );

  return { mockPullArtifact };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("OciDownloader", () => {
  describe("ensureArtifact", () => {
    it("skips download when cache directory already exists", async () => {
      setupResolveOciRef("schemas-k8s", "v1.31");
      setupMocks({ cacheExists: true });

      const downloader = new OciDownloader(cacheDir, defaultRegistry);
      const result = await downloader.ensureArtifact("schemas-k8s:v1.31");

      expect(result).toBe(path.join(cacheDir, "schemas-k8s", "v1.31"));
      expect(OciClient).not.toHaveBeenCalled();
    });

    it("pulls and extracts when cache directory does not exist", async () => {
      setupResolveOciRef("schemas-k8s", "v1.31");
      const { mockPullArtifact } = setupMocks({ cacheExists: false });

      const downloader = new OciDownloader(cacheDir, defaultRegistry);
      await downloader.ensureArtifact("schemas-k8s:v1.31");

      expect(OciClient).toHaveBeenCalledWith("ghcr.io", "wompipomp/schemas-k8s", undefined);
      expect(mockPullArtifact).toHaveBeenCalledWith("v1.31");
      expect(parseTar).toHaveBeenCalled();
    });

    it("extracts tar entries to {cacheDir}/{artifactName}/{tag}/{entryPath}", async () => {
      setupResolveOciRef("schemas-k8s", "v1.31");
      setupMocks({
        cacheExists: false,
        tarEntries: [
          { name: "apps/v1.star", type: "file", data: new Uint8Array([10, 20]) },
        ],
      });

      const downloader = new OciDownloader(cacheDir, defaultRegistry);
      await downloader.ensureArtifact("schemas-k8s:v1.31");

      // Files are written to a temp dir first, then renamed
      // Check that writeFileSync was called with the right relative structure
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining("apps" + path.sep + "v1.star"),
        expect.any(Buffer),
      );
    });

    it("creates intermediate directories with recursive: true", async () => {
      setupResolveOciRef("schemas-k8s", "v1.31");
      setupMocks({
        cacheExists: false,
        tarEntries: [
          { name: "apps/v1.star", type: "file", data: new Uint8Array([10]) },
        ],
      });

      const downloader = new OciDownloader(cacheDir, defaultRegistry);
      await downloader.ensureArtifact("schemas-k8s:v1.31");

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ recursive: true }),
      );
    });

    it("only extracts file-type tar entries (ignores directories and symlinks)", async () => {
      setupResolveOciRef("schemas-k8s", "v1.31");
      setupMocks({
        cacheExists: false,
        tarEntries: [
          { name: "apps/", type: "directory", data: undefined },
          { name: "apps/v1.star", type: "file", data: new Uint8Array([1]) },
          { name: "link.star", type: "symlink", data: undefined },
        ],
      });

      const downloader = new OciDownloader(cacheDir, defaultRegistry);
      await downloader.ensureArtifact("schemas-k8s:v1.31");

      // Only the file entry should be written
      expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining("v1.star"),
        expect.any(Buffer),
      );
    });

    it("deduplicates concurrent calls with the same OCI ref", async () => {
      setupResolveOciRef("schemas-k8s", "v1.31");
      setupMocks({ cacheExists: false });

      const downloader = new OciDownloader(cacheDir, defaultRegistry);

      // Launch two concurrent calls
      const [result1, result2] = await Promise.all([
        downloader.ensureArtifact("schemas-k8s:v1.31"),
        downloader.ensureArtifact("schemas-k8s:v1.31"),
      ]);

      // Both return the same path
      expect(result1).toBe(result2);

      // OciClient should only be constructed once (dedup)
      expect(OciClient).toHaveBeenCalledTimes(1);
    });

    it("runs concurrent calls with different OCI refs independently", async () => {
      // First call resolves to schemas-k8s:v1.31
      (resolveOciRef as unknown as Mock).mockReturnValueOnce({
        registryHost: "ghcr.io",
        repository: "wompipomp/schemas-k8s",
        tag: "v1.31",
      });
      // Second call resolves to schemas-k8s:v1.30
      (resolveOciRef as unknown as Mock).mockReturnValueOnce({
        registryHost: "ghcr.io",
        repository: "wompipomp/schemas-k8s",
        tag: "v1.30",
      });

      setupMocks({ cacheExists: false });

      const downloader = new OciDownloader(cacheDir, defaultRegistry);

      await Promise.all([
        downloader.ensureArtifact("schemas-k8s:v1.31"),
        downloader.ensureArtifact("schemas-k8s:v1.30"),
      ]);

      // Both should create their own OciClient
      expect(OciClient).toHaveBeenCalledTimes(2);
    });

    it("removes in-flight promise after completion", async () => {
      setupResolveOciRef("schemas-k8s", "v1.31");
      setupMocks({ cacheExists: false });

      const downloader = new OciDownloader(cacheDir, defaultRegistry);

      // First call
      await downloader.ensureArtifact("schemas-k8s:v1.31");

      // Reset mocks for second call -- cache now exists
      (fs.existsSync as unknown as Mock).mockReturnValue(true);

      // Second call after first completes should check cache again (not reuse in-flight)
      await downloader.ensureArtifact("schemas-k8s:v1.31");

      // Second call hits cache, so only 1 OciClient was created total
      expect(OciClient).toHaveBeenCalledTimes(1);
    });

    it("cleans up temp directory on download failure", async () => {
      setupResolveOciRef("schemas-k8s", "v1.31");
      setupMocks({ cacheExists: false });

      // Make pullArtifact fail
      const mockPullArtifact = vi.fn().mockRejectedValue(new Error("network error"));
      (OciClient as unknown as Mock).mockImplementation(() => ({
        pullArtifact: mockPullArtifact,
      }));

      const downloader = new OciDownloader(cacheDir, defaultRegistry);

      await expect(downloader.ensureArtifact("schemas-k8s:v1.31")).rejects.toThrow(
        "network error",
      );

      // Temp dir should be cleaned up
      expect(fs.rmSync).toHaveBeenCalledWith(
        expect.stringContaining(".tmp."),
        expect.objectContaining({ recursive: true, force: true }),
      );

      // Final cache dir should NOT have been created (no rename)
      expect(fs.renameSync).not.toHaveBeenCalled();
    });

    it("uses nanotar parseTar for tar extraction", async () => {
      setupResolveOciRef("schemas-k8s", "v1.31");
      setupMocks({ cacheExists: false });

      const downloader = new OciDownloader(cacheDir, defaultRegistry);
      await downloader.ensureArtifact("schemas-k8s:v1.31");

      expect(parseTar).toHaveBeenCalledWith(expect.any(Uint8Array));
    });
  });
});
