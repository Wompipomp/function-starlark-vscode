import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

vi.mock("./auth");

import { parseWwwAuthenticate } from "./auth";
import { OciClient } from "./client";

// --- Helpers ---

/** Build a minimal OCI manifest JSON. */
function makeManifest(layerDigest: string) {
  return {
    schemaVersion: 2,
    mediaType: "application/vnd.oci.image.manifest.v1+json",
    layers: [{ digest: layerDigest, mediaType: "application/vnd.fn-starlark.layer.v1.tar", size: 1024 }],
  };
}

/** Create a mock Response object. */
function mockResponse(status: number, body?: unknown, headers?: Record<string, string>): Response {
  const hdrs = new Headers(headers);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : status === 401 ? "Unauthorized" : "Error",
    headers: hdrs,
    json: () => Promise.resolve(body),
    arrayBuffer: () => Promise.resolve(body instanceof Uint8Array ? body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) : new ArrayBuffer(0)),
  } as unknown as Response;
}

let fetchMock: Mock;

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

describe("OciClient", () => {
  const registry = "ghcr.io";
  const repo = "wompipomp/schemas-k8s";
  const tag = "v1.31";
  const layerDigest = "sha256:abcdef1234567890";
  const manifest = makeManifest(layerDigest);

  describe("pullArtifact", () => {
    it("fetches manifest with correct Accept header", async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(200, manifest));
      fetchMock.mockResolvedValueOnce(mockResponse(200, new Uint8Array([1, 2, 3])));

      const client = new OciClient(registry, repo);
      await client.pullArtifact(tag);

      expect(fetchMock).toHaveBeenCalledWith(
        `https://${registry}/v2/${repo}/manifests/${tag}`,
        expect.objectContaining({
          headers: expect.objectContaining({
            Accept: "application/vnd.oci.image.manifest.v1+json",
          }),
        }),
      );
    });

    it("fetches blob using layer digest from manifest", async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(200, manifest));
      fetchMock.mockResolvedValueOnce(mockResponse(200, new Uint8Array([1, 2, 3])));

      const client = new OciClient(registry, repo);
      await client.pullArtifact(tag);

      expect(fetchMock).toHaveBeenCalledWith(
        `https://${registry}/v2/${repo}/blobs/${layerDigest}`,
        expect.objectContaining({
          headers: expect.objectContaining({}),
        }),
      );
    });

    it("returns Uint8Array of blob data", async () => {
      const blobData = new Uint8Array([10, 20, 30, 40]);
      fetchMock.mockResolvedValueOnce(mockResponse(200, manifest));
      fetchMock.mockResolvedValueOnce(mockResponse(200, blobData));

      const client = new OciClient(registry, repo);
      const result = await client.pullArtifact(tag);

      expect(result).toBeInstanceOf(Uint8Array);
      expect(result).toEqual(blobData);
    });

    it("handles 401 by parsing Www-Authenticate, exchanging for Bearer token, and retrying", async () => {
      const tokenEndpoint = "https://ghcr.io/token";
      (parseWwwAuthenticate as unknown as Mock).mockReturnValue({
        realm: tokenEndpoint,
        service: "ghcr.io",
        scope: `repository:${repo}:pull`,
      });

      // 1st call: manifest -> 401
      fetchMock.mockResolvedValueOnce(
        mockResponse(401, null, { "www-authenticate": `Bearer realm="${tokenEndpoint}",service="ghcr.io",scope="repository:${repo}:pull"` }),
      );
      // 2nd call: token exchange -> 200
      fetchMock.mockResolvedValueOnce(
        mockResponse(200, { token: "bearer-token-123" }),
      );
      // 3rd call: manifest retry -> 200
      fetchMock.mockResolvedValueOnce(mockResponse(200, manifest));
      // 4th call: blob -> 200
      fetchMock.mockResolvedValueOnce(mockResponse(200, new Uint8Array([1])));

      const client = new OciClient(registry, repo);
      await client.pullArtifact(tag);

      // Verify token exchange
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining(tokenEndpoint),
        expect.any(Object),
      );

      // Verify retry with Bearer token
      const retryCall = fetchMock.mock.calls[2];
      expect(retryCall[0]).toBe(`https://${registry}/v2/${repo}/manifests/${tag}`);
      expect(retryCall[1].headers.Authorization).toBe("Bearer bearer-token-123");
    });

    it("sends Basic auth to token endpoint when credentials provided", async () => {
      const creds = { username: "user", secret: "pass123" };
      const tokenEndpoint = "https://ghcr.io/token";

      (parseWwwAuthenticate as unknown as Mock).mockReturnValue({
        realm: tokenEndpoint,
        service: "ghcr.io",
        scope: `repository:${repo}:pull`,
      });

      fetchMock.mockResolvedValueOnce(
        mockResponse(401, null, { "www-authenticate": "Bearer ..." }),
      );
      fetchMock.mockResolvedValueOnce(
        mockResponse(200, { token: "bearer-token-456" }),
      );
      fetchMock.mockResolvedValueOnce(mockResponse(200, manifest));
      fetchMock.mockResolvedValueOnce(mockResponse(200, new Uint8Array([1])));

      const client = new OciClient(registry, repo, creds);
      await client.pullArtifact(tag);

      // Verify token exchange has Basic auth
      const tokenCall = fetchMock.mock.calls[1];
      const expectedBasic = Buffer.from("user:pass123").toString("base64");
      expect(tokenCall[1].headers.Authorization).toBe(`Basic ${expectedBasic}`);
    });

    it("sends anonymous request to token endpoint without credentials", async () => {
      const tokenEndpoint = "https://ghcr.io/token";

      (parseWwwAuthenticate as unknown as Mock).mockReturnValue({
        realm: tokenEndpoint,
        service: "ghcr.io",
        scope: `repository:${repo}:pull`,
      });

      fetchMock.mockResolvedValueOnce(
        mockResponse(401, null, { "www-authenticate": "Bearer ..." }),
      );
      fetchMock.mockResolvedValueOnce(
        mockResponse(200, { token: "anon-token" }),
      );
      fetchMock.mockResolvedValueOnce(mockResponse(200, manifest));
      fetchMock.mockResolvedValueOnce(mockResponse(200, new Uint8Array([1])));

      const client = new OciClient(registry, repo);
      await client.pullArtifact(tag);

      // Verify token exchange has no Authorization header
      const tokenCall = fetchMock.mock.calls[1];
      expect(tokenCall[1].headers.Authorization).toBeUndefined();
    });

    it("reuses Bearer token for blob request (no second 401)", async () => {
      const tokenEndpoint = "https://ghcr.io/token";

      (parseWwwAuthenticate as unknown as Mock).mockReturnValue({
        realm: tokenEndpoint,
        service: "ghcr.io",
        scope: `repository:${repo}:pull`,
      });

      fetchMock.mockResolvedValueOnce(
        mockResponse(401, null, { "www-authenticate": "Bearer ..." }),
      );
      fetchMock.mockResolvedValueOnce(
        mockResponse(200, { token: "reused-token" }),
      );
      fetchMock.mockResolvedValueOnce(mockResponse(200, manifest));
      fetchMock.mockResolvedValueOnce(mockResponse(200, new Uint8Array([42])));

      const client = new OciClient(registry, repo);
      await client.pullArtifact(tag);

      // Verify blob request reuses the token
      const blobCall = fetchMock.mock.calls[3];
      expect(blobCall[1].headers.Authorization).toBe("Bearer reused-token");
    });

    it("sends POST with refresh_token grant when credentials have identityToken", async () => {
      const tokenEndpoint = "https://myregistry.azurecr.io/oauth2/token";
      const creds = { username: "", secret: "", identityToken: "acr-refresh-token" };

      (parseWwwAuthenticate as unknown as Mock).mockReturnValue({
        realm: tokenEndpoint,
        service: "myregistry.azurecr.io",
        scope: `repository:${repo}:pull`,
      });

      // 1st: manifest -> 401
      fetchMock.mockResolvedValueOnce(
        mockResponse(401, null, { "www-authenticate": "Bearer ..." }),
      );
      // 2nd: token exchange POST -> 200
      fetchMock.mockResolvedValueOnce(
        mockResponse(200, { token: "acr-access-token" }),
      );
      // 3rd: manifest retry -> 200
      fetchMock.mockResolvedValueOnce(mockResponse(200, manifest));
      // 4th: blob -> 200
      fetchMock.mockResolvedValueOnce(mockResponse(200, new Uint8Array([1])));

      const client = new OciClient(registry, repo, creds);
      await client.pullArtifact(tag);

      // Verify the token exchange call used POST
      const tokenCall = fetchMock.mock.calls[1];
      expect(tokenCall[1].method).toBe("POST");
      expect(tokenCall[1].headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
      expect(tokenCall[1].body).toContain("grant_type=refresh_token");
      expect(tokenCall[1].body).toContain("refresh_token=acr-refresh-token");
      expect(tokenCall[1].headers.Authorization).toBeUndefined();
    });

    it("falls back to POST refresh_token when GET+Basic returns non-200", async () => {
      const tokenEndpoint = "https://ghcr.io/token";
      const creds = { username: "user", secret: "might-be-refresh-token" };

      (parseWwwAuthenticate as unknown as Mock).mockReturnValue({
        realm: tokenEndpoint,
        service: "ghcr.io",
        scope: `repository:${repo}:pull`,
      });

      // 1st: manifest -> 401
      fetchMock.mockResolvedValueOnce(
        mockResponse(401, null, { "www-authenticate": "Bearer ..." }),
      );
      // 2nd: GET token exchange (Basic) -> 401 (fails)
      fetchMock.mockResolvedValueOnce(mockResponse(401, null));
      // 3rd: POST token exchange (refresh_token fallback) -> 200
      fetchMock.mockResolvedValueOnce(
        mockResponse(200, { token: "fallback-token" }),
      );
      // 4th: manifest retry -> 200
      fetchMock.mockResolvedValueOnce(mockResponse(200, manifest));
      // 5th: blob -> 200
      fetchMock.mockResolvedValueOnce(mockResponse(200, new Uint8Array([1])));

      const client = new OciClient(registry, repo, creds);
      await client.pullArtifact(tag);

      // 3 fetch calls before manifest retry: initial manifest, GET token, POST token
      expect(fetchMock.mock.calls).toHaveLength(5);
      // 2nd call: GET with Basic auth
      expect(fetchMock.mock.calls[1][1].method).toBeUndefined(); // GET (default)
      // 3rd call: POST with refresh_token
      expect(fetchMock.mock.calls[2][1].method).toBe("POST");
      expect(fetchMock.mock.calls[2][1].body).toContain("refresh_token=might-be-refresh-token");
    });

    it("handles access_token in token response instead of token", async () => {
      const tokenEndpoint = "https://ghcr.io/token";

      (parseWwwAuthenticate as unknown as Mock).mockReturnValue({
        realm: tokenEndpoint,
        service: "ghcr.io",
        scope: `repository:${repo}:pull`,
      });

      // 1st: manifest -> 401
      fetchMock.mockResolvedValueOnce(
        mockResponse(401, null, { "www-authenticate": "Bearer ..." }),
      );
      // 2nd: token exchange returns access_token instead of token
      fetchMock.mockResolvedValueOnce(
        mockResponse(200, { access_token: "acr-access-tok" }),
      );
      // 3rd: manifest retry -> 200
      fetchMock.mockResolvedValueOnce(mockResponse(200, manifest));
      // 4th: blob -> 200
      fetchMock.mockResolvedValueOnce(mockResponse(200, new Uint8Array([1])));

      const client = new OciClient(registry, repo);
      await client.pullArtifact(tag);

      // Verify retry uses the access_token
      const retryCall = fetchMock.mock.calls[2];
      expect(retryCall[1].headers.Authorization).toBe("Bearer acr-access-tok");
    });

    it("throws on non-200 manifest response after auth retry", async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(403, null));

      const client = new OciClient(registry, repo);
      await expect(client.pullArtifact(tag)).rejects.toThrow(/manifest.*403/i);
    });

    it("throws on non-200 blob response", async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(200, manifest));
      fetchMock.mockResolvedValueOnce(mockResponse(404, null));

      const client = new OciClient(registry, repo);
      await expect(client.pullArtifact(tag)).rejects.toThrow(/blob.*404/i);
    });
  });
});
