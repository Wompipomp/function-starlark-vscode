/**
 * Docker credential helper integration and Www-Authenticate parsing.
 *
 * Reads ~/.docker/config.json and resolves registry credentials through
 * the Docker credential helper chain: credHelpers -> credsStore -> static auths.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawn } from "child_process";

/** Credentials resolved from Docker config. */
export interface DockerCredentials {
  username: string;
  secret: string;
}

/** Parameters extracted from a WWW-Authenticate Bearer challenge. */
export interface WwwAuthenticateParams {
  realm: string;
  service: string;
  scope: string;
}

interface DockerConfig {
  credHelpers?: Record<string, string>;
  credsStore?: string;
  auths?: Record<string, { auth?: string }>;
}

/**
 * Read and parse the Docker config.json file.
 * Returns undefined if the file doesn't exist or can't be parsed.
 */
function readDockerConfig(): DockerConfig | undefined {
  const configPath = path.join(os.homedir(), ".docker", "config.json");
  if (!fs.existsSync(configPath)) return undefined;

  try {
    const content = fs.readFileSync(configPath, "utf-8");
    return JSON.parse(content) as DockerConfig;
  } catch {
    return undefined;
  }
}

/**
 * Spawn a Docker credential helper binary and retrieve credentials.
 *
 * The protocol: write the registry hostname to stdin, read JSON from stdout.
 * Response format: { "Username": "...", "Secret": "..." }
 *
 * 5-second timeout prevents hanging on broken helpers.
 */
function runCredentialHelper(
  helperName: string,
  registry: string,
): Promise<DockerCredentials | undefined> {
  return new Promise((resolve) => {
    const binaryName = `docker-credential-${helperName}`;
    const child = spawn(binaryName, ["get"], { timeout: 5000 });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("close", (code: number | null) => {
      if (code !== 0 || !stdout) {
        resolve(undefined);
        return;
      }

      try {
        const parsed = JSON.parse(stdout) as {
          Username?: string;
          Secret?: string;
        };
        if (parsed.Username && parsed.Secret) {
          resolve({ username: parsed.Username, secret: parsed.Secret });
        } else {
          resolve(undefined);
        }
      } catch {
        resolve(undefined);
      }
    });

    child.on("error", () => {
      resolve(undefined);
    });

    // Write registry to stdin and close it
    child.stdin.write(registry);
    child.stdin.end();
  });
}

/**
 * Get Docker credentials for a registry.
 *
 * Credential resolution order:
 * 1. credHelpers[registry] - registry-specific credential helper
 * 2. credsStore - default credential store for all registries
 * 3. auths[registry] - base64-encoded static credentials
 * 4. undefined - anonymous pull (no credentials)
 */
export async function getDockerCredentials(
  registry: string,
): Promise<DockerCredentials | undefined> {
  const config = readDockerConfig();
  if (!config) return undefined;

  // 1. Check credHelpers for registry-specific helper
  if (config.credHelpers?.[registry]) {
    return runCredentialHelper(config.credHelpers[registry], registry);
  }

  // 2. Fall back to credsStore (default credential store)
  if (config.credsStore) {
    return runCredentialHelper(config.credsStore, registry);
  }

  // 3. Fall back to static base64 auths
  const authEntry = config.auths?.[registry];
  if (authEntry?.auth) {
    try {
      const decoded = Buffer.from(authEntry.auth, "base64").toString("utf-8");
      const colonIdx = decoded.indexOf(":");
      if (colonIdx > 0) {
        return {
          username: decoded.substring(0, colonIdx),
          secret: decoded.substring(colonIdx + 1),
        };
      }
    } catch {
      // Malformed base64; fall through to anonymous
    }
  }

  // 4. No credentials found - anonymous pull
  return undefined;
}

/**
 * Parse a WWW-Authenticate header from an OCI registry 401 response.
 *
 * Expected format: Bearer realm="...",service="...",scope="..."
 * Service and scope default to empty string if missing.
 * Returns undefined for non-Bearer challenges.
 */
export function parseWwwAuthenticate(
  header: string,
): WwwAuthenticateParams | undefined {
  if (!header.startsWith("Bearer ")) return undefined;

  const params = header.substring("Bearer ".length);

  function extractParam(name: string): string {
    const re = new RegExp(`${name}="([^"]*)"`);
    const match = params.match(re);
    return match ? match[1] : "";
  }

  const realm = extractParam("realm");
  if (!realm) return undefined;

  return {
    realm,
    service: extractParam("service"),
    scope: extractParam("scope"),
  };
}
