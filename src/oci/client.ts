/**
 * OCI Distribution API client for pulling schema artifacts.
 *
 * Fetches manifests and blobs from OCI-compliant registries.
 * Handles 401 challenge-response auth flow for both authenticated
 * (Basic credentials) and anonymous pulls.
 */

import { type DockerCredentials, parseWwwAuthenticate } from "./auth";

/** Minimal OCI image manifest structure (fields we need). */
interface OciManifest {
  schemaVersion: number;
  layers: Array<{
    digest: string;
    mediaType: string;
    size: number;
  }>;
}

/**
 * OCI Distribution API client.
 *
 * Usage:
 *   const client = new OciClient("ghcr.io", "org/repo", credentials);
 *   const tarData = await client.pullArtifact("v1.31");
 */
export class OciClient {
  private readonly baseUrl: string;
  private readonly repository: string;
  private readonly credentials?: DockerCredentials;
  private bearerToken?: string;

  constructor(
    registryHost: string,
    repository: string,
    credentials?: DockerCredentials,
  ) {
    this.baseUrl = `https://${registryHost}`;
    this.repository = repository;
    this.credentials = credentials;
  }

  /**
   * Pull a complete artifact: fetch the manifest, extract the first layer
   * digest, and download the blob as a Uint8Array (tar data).
   */
  async pullArtifact(tag: string): Promise<Uint8Array> {
    const manifest = await this.getManifest(tag);
    const layerDigest = manifest.layers[0].digest;
    return this.getBlob(layerDigest);
  }

  /**
   * Fetch the OCI image manifest for a given tag.
   *
   * Uses the OCI v1 manifest media type as the Accept header.
   * Handles 401 by exchanging credentials for a Bearer token.
   */
  private async getManifest(tag: string): Promise<OciManifest> {
    const url = `${this.baseUrl}/v2/${this.repository}/manifests/${tag}`;
    const accept = "application/vnd.oci.image.manifest.v1+json";

    const response = await this.authenticatedFetch(url, accept);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch manifest from ${this.baseUrl}: ${response.status} ${response.statusText}`,
      );
    }

    return (await response.json()) as OciManifest;
  }

  /**
   * Fetch a blob by digest and return as Uint8Array.
   *
   * Reuses the Bearer token obtained during manifest fetch.
   */
  private async getBlob(digest: string): Promise<Uint8Array> {
    const url = `${this.baseUrl}/v2/${this.repository}/blobs/${digest}`;

    const headers: Record<string, string> = {};
    if (this.bearerToken) {
      headers["Authorization"] = `Bearer ${this.bearerToken}`;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch blob ${digest}: ${response.status} ${response.statusText}`,
      );
    }

    return new Uint8Array(await response.arrayBuffer());
  }

  /**
   * Make an authenticated fetch request with 401 challenge-response handling.
   *
   * Flow:
   * 1. Send request with Accept header
   * 2. If 401, parse Www-Authenticate header for Bearer challenge params
   * 3. Exchange credentials at the token endpoint (Basic auth if creds, anonymous otherwise)
   * 4. Cache the Bearer token and retry the original request
   */
  private async authenticatedFetch(
    url: string,
    accept: string,
  ): Promise<Response> {
    const headers: Record<string, string> = { Accept: accept };

    if (this.bearerToken) {
      headers["Authorization"] = `Bearer ${this.bearerToken}`;
    }

    const response = await fetch(url, { headers });

    if (response.status !== 401) {
      return response;
    }

    // Handle 401 challenge-response
    const wwwAuth = response.headers.get("www-authenticate");
    if (!wwwAuth) {
      return response;
    }

    const challenge = parseWwwAuthenticate(wwwAuth);
    if (!challenge) {
      return response;
    }

    // Exchange for Bearer token
    const token = await this.exchangeToken(challenge.realm, challenge.service, challenge.scope);
    if (!token) {
      return response;
    }

    this.bearerToken = token;

    // Retry with Bearer token
    headers["Authorization"] = `Bearer ${token}`;
    return fetch(url, { headers });
  }

  /**
   * Exchange credentials for a Bearer token at the registry's token endpoint.
   *
   * Sends Basic auth if credentials are available, anonymous request otherwise.
   */
  private async exchangeToken(
    realm: string,
    service: string,
    scope: string,
  ): Promise<string | undefined> {
    const params = new URLSearchParams();
    if (service) params.set("service", service);
    if (scope) params.set("scope", scope);

    const tokenUrl = `${realm}?${params.toString()}`;
    const headers: Record<string, string> = {};

    if (this.credentials) {
      const basic = Buffer.from(
        `${this.credentials.username}:${this.credentials.secret}`,
      ).toString("base64");
      headers["Authorization"] = `Basic ${basic}`;
    }

    const response = await fetch(tokenUrl, { headers });

    if (!response.ok) {
      return undefined;
    }

    const body = (await response.json()) as { token?: string };
    return body.token;
  }
}
