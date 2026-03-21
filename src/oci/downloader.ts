/**
 * OCI artifact download orchestrator.
 *
 * Coordinates cache check, credential resolution, OCI pull, tar extraction,
 * and deduplication of concurrent downloads for the same artifact.
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { parseTar } from "nanotar";
import { OciClient } from "./client";
import { getDockerCredentials } from "./auth";
import { resolveOciRef } from "../load-parser";

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

      // Pull the artifact (manifest + blob)
      const client = new OciClient(registryHost, repository, credentials);
      const tarData = await client.pullArtifact(tag);

      // Extract tar entries
      const entries = parseTar(tarData);

      // Create the temp directory
      fs.mkdirSync(tmpDir, { recursive: true });

      for (const entry of entries) {
        // Only extract file-type entries (nanotar uses "file" for regular files)
        if (entry.type && entry.type !== "file") {
          continue;
        }

        if (!entry.data) {
          continue;
        }

        const outPath = path.join(tmpDir, entry.name);
        const dirName = path.dirname(outPath);

        // Create intermediate directories
        fs.mkdirSync(dirName, { recursive: true });
        fs.writeFileSync(outPath, Buffer.from(entry.data));
      }

      // Atomic move: rename temp dir to final cache dir
      fs.renameSync(tmpDir, artifactCacheDir);

      this.log?.info(`Cached: ${registryHost}/${repository}:${tag}`);
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
}
