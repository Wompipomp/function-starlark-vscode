/**
 * OCI artifact download orchestrator.
 *
 * Coordinates cache check, credential resolution, OCI pull, tar extraction,
 * and deduplication of concurrent downloads for the same artifact.
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import * as zlib from "zlib";
import { parseTar } from "nanotar";
import { OciClient, type OciLayer } from "./client";
import { getDockerCredentials } from "./auth";
import { resolveOciRef } from "../load-parser";

/** Detect gzip magic bytes (0x1f 0x8b). */
function isGzip(data: Uint8Array): boolean {
  return data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b;
}

/** Detect tar by checking for valid tar header (name + null padding in first 512 bytes). */
function isTar(data: Uint8Array): boolean {
  // Tar header is 512 bytes minimum. Byte 257-261 should be "ustar" for POSIX tar.
  if (data.length < 512) return false;
  const ustar = String.fromCharCode(...data.slice(257, 262));
  return ustar === "ustar";
}

/** Minimal log interface matching VSCode LogOutputChannel. */
interface Log {
  info(message: string): void;
  warn(message: string): void;
}

/**
 * OCI artifact download orchestrator.
 *
 * Manages the lifecycle of downloading and extracting OCI schema artifacts:
 * - Checks the local cache before pulling (versions are immutable)
 * - Resolves Docker credentials for private registries
 * - Deduplicates concurrent downloads for the same OCI reference
 * - Extracts tar archives atomically (temp dir + rename)
 * - Cleans up on failure to prevent partial cache entries
 */
export class OciDownloader {
  private readonly cacheDir: string;
  private readonly defaultRegistry: string;
  private readonly log?: Log;
  private readonly inFlight = new Map<string, Promise<string>>();

  constructor(cacheDir: string, defaultRegistry: string, log?: Log) {
    this.cacheDir = cacheDir;
    this.defaultRegistry = defaultRegistry;
    this.log = log;
  }

  /**
   * Ensure an OCI artifact is available in the local cache.
   *
   * Returns the path to the artifact's cache directory.
   * If the artifact is already cached, returns immediately.
   * Concurrent calls for the same OCI ref share a single download.
   */
  async ensureArtifact(ociRef: string): Promise<string> {
    const resolved = resolveOciRef(ociRef, this.defaultRegistry);
    const artifactName = resolved.repository.split("/").pop()!;
    const artifactCacheDir = path.join(this.cacheDir, artifactName, resolved.tag);

    // Cache hit -- version is immutable, skip download
    if (fs.existsSync(artifactCacheDir)) {
      this.log?.info(`Cache hit: ${ociRef}`);
      return artifactCacheDir;
    }

    // Dedup key: the full resolved artifact path
    const dedupKey = `${resolved.registryHost}/${resolved.repository}:${resolved.tag}`;

    // Check in-flight map for concurrent deduplication
    const existing = this.inFlight.get(dedupKey);
    if (existing) {
      return existing;
    }

    // Create and store the download promise
    const promise = this.downloadAndExtract(resolved.registryHost, resolved.repository, resolved.tag, artifactCacheDir)
      .finally(() => {
        this.inFlight.delete(dedupKey);
      });

    this.inFlight.set(dedupKey, promise);
    return promise;
  }

  /**
   * Download and extract an OCI artifact to the cache.
   *
   * Uses atomic cache population: writes to a temp directory first,
   * then renames to the final path. On failure, cleans up the temp dir
   * so no partial cache entries are left behind.
   */
  private async downloadAndExtract(
    registryHost: string,
    repository: string,
    tag: string,
    artifactCacheDir: string,
  ): Promise<string> {
    const randomSuffix = crypto.randomBytes(4).toString("hex");
    const tmpDir = `${artifactCacheDir}.tmp.${randomSuffix}`;

    try {
      this.log?.info(`Downloading: ${registryHost}/${repository}:${tag}`);

      // Resolve credentials for the registry
      const credentials = await getDockerCredentials(registryHost);

      // Pull all layers from the artifact
      const client = new OciClient(registryHost, repository, credentials);
      const layers = await client.pullArtifact(tag);

      // Create the temp directory
      fs.mkdirSync(tmpDir, { recursive: true });

      let extracted = 0;
      for (const layer of layers) {
        extracted += this.extractLayer(layer, tmpDir);
      }

      // Atomic move: rename temp dir to final cache dir
      fs.renameSync(tmpDir, artifactCacheDir);

      this.log?.info(`Cached: ${registryHost}/${repository}:${tag} (${extracted} files extracted)`);
      return artifactCacheDir;
    } catch (error) {
      // Clean up temp directory on failure
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
      this.log?.warn(`Download failed: ${registryHost}/${repository}:${tag} - ${error}`);
      throw error;
    }
  }

  /**
   * Extract a single OCI layer to the target directory.
   *
   * Handles three formats:
   * - tar+gzip: decompress then extract tar entries
   * - plain tar: extract tar entries directly
   * - raw file: write directly using the filename annotation
   *
   * Returns the number of files extracted.
   */
  private extractLayer(layer: OciLayer, targetDir: string): number {
    let data = layer.data;

    // Decompress gzip if needed
    if (isGzip(data)) {
      data = new Uint8Array(zlib.gunzipSync(data));
    }

    // Try tar extraction
    if (isTar(data)) {
      return this.extractTar(data, targetDir);
    }

    // Raw file layer — use annotation filename
    if (layer.filename) {
      const outPath = path.join(targetDir, layer.filename);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, Buffer.from(data));
      this.log?.info(`Extracted file layer: ${layer.filename} (${data.length} bytes)`);
      return 1;
    }

    this.log?.warn(`Skipping layer: no tar header and no filename annotation (mediaType=${layer.mediaType}, ${data.length} bytes)`);
    return 0;
  }

  /** Extract tar entries to the target directory. Returns file count. */
  private extractTar(data: Uint8Array, targetDir: string): number {
    const entries = parseTar(data);
    let count = 0;

    for (const entry of entries) {
      if (entry.type && entry.type !== "file") continue;
      if (!entry.data) continue;

      const outPath = path.join(targetDir, entry.name);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, Buffer.from(entry.data));
      count++;
    }

    return count;
  }
}
