/**
 * OCI Distribution API client for pulling schema artifacts.
 *
 * Fetches manifests and blobs from OCI-compliant registries.
 * Handles 401 challenge-response auth flow for both authenticated
 * (Basic credentials) and anonymous pulls.
 */

import { type DockerCredentials, parseWwwAuthenticate } from "./auth";
import {
  OciDownloadError,
  classifyHttpStatus,
  wrapNetworkError,
} from "./errors";

/** A downloaded OCI layer with metadata. */
export interface OciLayer {
  mediaType: string;
  data: Uint8Array;
  /** Filename from org.opencontainers.image.title annotation. */
  filename?: string;
}

/** Minimal OCI image manifest structure (fields we need). */
interface OciManifest {
  schemaVersion: number;
  layers: Array<{
    digest: string;
    mediaType: string;
    size: number;
    annotations?: Record<string, string>;
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
  private readonly registryHost: string;
  private readonly baseUrl: string;
  private readonly repository: string;
  private readonly credentials?: DockerCredentials;
  private bearerToken?: string;

  constructor(
    registryHost: string,
    repository: string,
    credentials?: DockerCredentials,
  ) {
    this.registryHost = registryHost;
    this.baseUrl = `https://${registryHost}`;
    this.repository = repository;
    this.credentials = credentials;
  }

  /**
   * Pull all layers from an OCI artifact.
   *
   * Returns each layer with its mediaType, data, and optional filename
   * (from the org.opencontainers.image.title annotation).
   *
   * Throws {@link OciDownloadError} on any failure — auth, 404, network,
   * or other — so callers can classify and surface the cause to the user.
   */
  async pullArtifact(tag: string): Promise<OciLayer[]> {
    try {
      const manifest = await this.getManifest(tag);
      const layers: OciLayer[] = [];

      for (const layer of manifest.layers) {
        const data = await this.getBlob(layer.digest, tag);
        layers.push({
          mediaType: layer.mediaType,
          data,
          filename: layer.annotations?.["org.opencontainers.image.title"],
        });
      }

      return layers;
    } catch (err) {
      if (err instanceof OciDownloadError) throw err;
      // fetch() rejected (DNS, TCP, TLS, ...) — wrap as network error.
      throw wrapNetworkError(err, {
        registryHost: this.registryHost,
        repository: this.repository,
        tag,
      });
    }
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
      throw new OciDownloadError({
        kind: classifyHttpStatus(response.status),
        message: `manifest ${response.status} ${response.statusText}`,
        registryHost: this.registryHost,
        repository: this.repository,
        tag,
        httpStatus: response.status,
      });
    }

    return (await response.json()) as OciManifest;
  }

  /**
   * Fetch a blob by digest and return as Uint8Array.
   *
   * Reuses the Bearer token obtained during manifest fetch.
   */
  private async getBlob(digest: string, tag: string): Promise<Uint8Array> {
    const url = `${this.baseUrl}/v2/${this.repository}/blobs/${digest}`;

    const headers: Record<string, string> = {};
    if (this.bearerToken) {
      headers["Authorization"] = `Bearer ${this.bearerToken}`;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new OciDownloadError({
        kind: classifyHttpStatus(response.status),
        message: `blob ${digest} ${response.status} ${response.statusText}`,
        registryHost: this.registryHost,
        repository: this.repository,
        tag,
        httpStatus: response.status,
      });
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
   * Auth strategies in order:
   * A. Identity token (ACR OAuth2) — POST with grant_type=refresh_token
   * B. Basic auth (username+secret) — GET with Authorization: Basic header
   * C. Refresh token fallback — POST with secret as refresh_token (when B fails)
   * D. Anonymous — GET with no auth header
   */
  private async exchangeToken(
    realm: string,
    service: string,
    scope: string,
  ): Promise<string | undefined> {
    // Strategy A: Identity token (ACR OAuth2 refresh token)
    if (this.credentials?.identityToken) {
      return this.exchangeRefreshToken(realm, service, scope, this.credentials.identityToken);
    }

    const params = new URLSearchParams();
    if (service) params.set("service", service);
    if (scope) params.set("scope", scope);

    const tokenUrl = `${realm}?${params.toString()}`;

    if (this.credentials) {
      // Strategy B: GET with Basic auth
      const basic = Buffer.from(
        `${this.credentials.username}:${this.credentials.secret}`,
      ).toString("base64");

      const response = await fetch(tokenUrl, {
        headers: { Authorization: `Basic ${basic}` },
      });

      if (response.ok) {
        const body = (await response.json()) as { token?: string; access_token?: string };
        return body.token ?? body.access_token;
      }

      // Strategy C: Basic auth failed — try POST with secret as refresh_token
      return this.exchangeRefreshToken(realm, service, scope, this.credentials.secret);
    }

    // Strategy D: Anonymous GET
    const response = await fetch(tokenUrl, { headers: {} });

    if (!response.ok) {
      return undefined;
    }

    const body = (await response.json()) as { token?: string; access_token?: string };
    return body.token ?? body.access_token;
  }

  /**
   * POST-based token exchange using an OAuth2 refresh token.
   *
   * Used by ACR and registries that store refresh tokens in Docker config
   * (as identitytoken or credential helper secret).
   */
  private async exchangeRefreshToken(
    realm: string,
    service: string,
    scope: string,
    refreshToken: string,
  ): Promise<string | undefined> {
    const body = new URLSearchParams();
    body.set("grant_type", "refresh_token");
    if (service) body.set("service", service);
    if (scope) body.set("scope", scope);
    body.set("refresh_token", refreshToken);

    const response = await fetch(realm, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!response.ok) {
      return undefined;
    }

    const json = (await response.json()) as { token?: string; access_token?: string };
    return json.token ?? json.access_token;
  }
}
