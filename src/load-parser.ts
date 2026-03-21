/**
 * Load statement parser for Starlark .star files.
 *
 * Extracts OCI references and imported symbol names from load() calls,
 * enabling both OCI auto-download and per-file completion scoping.
 */

/** A parsed load() statement referencing an OCI artifact. */
export interface LoadStatement {
  /** OCI reference (e.g., "schemas-k8s:v1.31" or "ghcr.io/org/schemas:v2.0") */
  ociRef: string;
  /** Path within the tar archive (e.g., "apps/v1.star") */
  tarEntryPath: string;
  /** Imported symbol names (e.g., ["Deployment", "StatefulSet"]) */
  symbols: string[];
  /** Full load path as written (e.g., "schemas-k8s:v1.31/apps/v1.star") */
  fullPath: string;
}

/** A fully resolved OCI reference with registry, repository, and tag. */
export interface OciRefResolved {
  /** Registry hostname (e.g., "ghcr.io") */
  registryHost: string;
  /** Repository path (e.g., "wompipomp/schemas-k8s") */
  repository: string;
  /** Tag (e.g., "v1.31") */
  tag: string;
}

/**
 * Validate whether a load() path is a valid OCI reference.
 *
 * A valid OCI load path must:
 * 1. Have a colon with content before it (not starting with / or //)
 * 2. Have a `/` after the colon-tag portion
 * 3. End with `.star`
 *
 * This distinguishes OCI refs (`schemas-k8s:v1.31/apps/v1.star`)
 * from Bazel labels (`//lib:utils.star`) and incomplete paths.
 */
export function isOciLoadPath(path: string): boolean {
  // Must not start with / (Bazel labels like //lib:utils.star)
  if (path.startsWith("/")) return false;

  const colonIdx = path.indexOf(":");
  if (colonIdx <= 0) return false;

  // Must have a slash after the colon (tag/entry-path separator)
  const afterColon = path.substring(colonIdx + 1);
  const slashIdx = afterColon.indexOf("/");
  if (slashIdx <= 0) return false;

  // Must end with .star
  if (!path.endsWith(".star")) return false;

  return true;
}

/**
 * Split a full OCI load path into the OCI reference and tar entry path.
 *
 * The split occurs at the first `/` after the colon (tag separator).
 * Everything before is the OCI ref, everything after is the tar entry path.
 */
export function splitOciPath(fullPath: string): {
  ociRef: string;
  tarEntryPath: string;
} {
  const colonIdx = fullPath.indexOf(":");
  const afterColon = fullPath.substring(colonIdx + 1);
  const slashIdx = afterColon.indexOf("/");

  const ociRef = fullPath.substring(0, colonIdx + 1 + slashIdx);
  const tarEntryPath = afterColon.substring(slashIdx + 1);

  return { ociRef, tarEntryPath };
}

/**
 * Resolve an OCI reference to its registry host, repository, and tag.
 *
 * If the ociRef contains a dot before the colon, it's treated as a full URI
 * (e.g., "ghcr.io/org/schemas:v2.0"). Otherwise, it's a short path that uses
 * the default registry (e.g., "schemas-k8s:v1.31" with "ghcr.io/wompipomp").
 */
export function resolveOciRef(
  ociRef: string,
  defaultRegistry: string,
): OciRefResolved {
  const colonIdx = ociRef.indexOf(":");
  const name = ociRef.substring(0, colonIdx);
  const tag = ociRef.substring(colonIdx + 1);

  // Check if the name portion contains a dot (indicates hostname)
  const hasDot = name.includes(".");

  if (hasDot) {
    // Full URI: split at first / for registryHost
    const slashIdx = name.indexOf("/");
    const registryHost = name.substring(0, slashIdx);
    const repository = name.substring(slashIdx + 1);
    return { registryHost, repository, tag };
  }

  // Short path: use default registry
  const regSlashIdx = defaultRegistry.indexOf("/");
  const registryHost = defaultRegistry.substring(0, regSlashIdx);
  const regPath = defaultRegistry.substring(regSlashIdx + 1);
  const repository = `${regPath}/${name}`;

  return { registryHost, repository, tag };
}

/**
 * Convert an OCI reference to its cache-relative key prefix.
 *
 * The downloader stores artifacts at `{cacheDir}/{artifactName}/{tag}/`,
 * where `artifactName` is the last segment of the resolved repository.
 * This function produces the same `{artifactName}/{tag}` prefix so that
 * middleware and diagnostics can look up SchemaIndex keys correctly
 * regardless of whether the user wrote a short (`schemas-k8s:v1.31`)
 * or full (`ghcr.io/org/schemas-k8s:v1.31`) OCI reference.
 */
export function ociRefToCacheKey(ociRef: string): string {
  const colonIdx = ociRef.indexOf(":");
  const name = ociRef.substring(0, colonIdx);
  const tag = ociRef.substring(colonIdx + 1);

  // Extract just the last path segment (artifact name)
  const slashIdx = name.lastIndexOf("/");
  const artifactName = slashIdx >= 0 ? name.substring(slashIdx + 1) : name;

  return `${artifactName}/${tag}`;
}

/**
 * Parse all load() statements from .star file text and return those
 * that reference OCI artifacts.
 *
 * Extracts the load path and imported symbol names. Skips non-OCI paths
 * (Bazel labels, relative imports, incomplete paths) and load() calls
 * with no symbols.
 */
export function parseLoadStatements(text: string): LoadStatement[] {
  // Create regex inside the function to avoid shared state with global flag
  const loadRe = /load\(\s*"([^"]+)"((?:\s*,\s*"[^"]*")*)\s*\)/g;
  const symbolRe = /"([^"]*)"/g;

  const results: LoadStatement[] = [];
  let match: RegExpExecArray | null;

  while ((match = loadRe.exec(text)) !== null) {
    const fullPath = match[1];
    const symbolsPart = match[2];

    // Skip non-OCI paths
    if (!isOciLoadPath(fullPath)) continue;

    // Extract symbols from the comma-separated part
    const symbols: string[] = [];
    let symMatch: RegExpExecArray | null;
    const symRe = new RegExp(symbolRe.source, "g");
    while ((symMatch = symRe.exec(symbolsPart)) !== null) {
      if (symMatch[1]) {
        symbols.push(symMatch[1]);
      }
    }

    // Skip entries with zero symbols
    if (symbols.length === 0) continue;

    const { ociRef, tarEntryPath } = splitOciPath(fullPath);
    results.push({ ociRef, tarEntryPath, symbols, fullPath });
  }

  return results;
}
