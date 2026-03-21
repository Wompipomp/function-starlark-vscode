import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { EventEmitter } from "events";

vi.mock("fs");
vi.mock("child_process");
vi.mock("os", () => ({ homedir: () => "/mock/home" }));

import * as fs from "fs";
import { spawn } from "child_process";
import { getDockerCredentials, parseWwwAuthenticate } from "./auth";

/** Simulate a credential helper that writes JSON to stdout. */
function mockCredHelperSuccess(json: object) {
  const child = new EventEmitter() as EventEmitter & {
    stdin: { write: Mock; end: Mock };
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: Mock;
  };
  child.stdin = { write: vi.fn(), end: vi.fn() };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();

  (spawn as unknown as Mock).mockReturnValue(child);

  queueMicrotask(() => {
    child.stdout.emit("data", Buffer.from(JSON.stringify(json)));
    child.emit("close", 0);
  });
}

/** Simulate a credential helper that exits with non-zero. */
function mockCredHelperFailure(code: number, stderr = "") {
  const child = new EventEmitter() as EventEmitter & {
    stdin: { write: Mock; end: Mock };
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: Mock;
  };
  child.stdin = { write: vi.fn(), end: vi.fn() };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();

  (spawn as unknown as Mock).mockReturnValue(child);

  queueMicrotask(() => {
    if (stderr) child.stderr.emit("data", Buffer.from(stderr));
    child.emit("close", code);
  });
}

function stubDockerConfig(config: object) {
  (fs.existsSync as unknown as Mock).mockReturnValue(true);
  (fs.readFileSync as unknown as Mock).mockReturnValue(JSON.stringify(config));
}

function stubNoDockerConfig() {
  (fs.existsSync as unknown as Mock).mockReturnValue(false);
}

describe("getDockerCredentials", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns undefined when no Docker config exists", async () => {
    stubNoDockerConfig();
    const result = await getDockerCredentials("ghcr.io");
    expect(result).toBeUndefined();
    expect(spawn).not.toHaveBeenCalled();
  });

  it("returns credentials from credHelpers when registry matches", async () => {
    stubDockerConfig({
      credHelpers: { "ghcr.io": "desktop" },
    });
    mockCredHelperSuccess({ Username: "user", Secret: "pass123" });

    const result = await getDockerCredentials("ghcr.io");

    expect(spawn).toHaveBeenCalledWith(
      "docker-credential-desktop",
      ["get"],
      expect.objectContaining({ timeout: 5000 }),
    );
    expect(result).toEqual({ username: "user", secret: "pass123" });
  });

  it("writes registry to stdin and closes it", async () => {
    stubDockerConfig({
      credHelpers: { "ghcr.io": "desktop" },
    });
    mockCredHelperSuccess({ Username: "user", Secret: "pass123" });

    await getDockerCredentials("ghcr.io");

    const child = (spawn as unknown as Mock).mock.results[0].value;
    expect(child.stdin.write).toHaveBeenCalledWith("ghcr.io");
    expect(child.stdin.end).toHaveBeenCalled();
  });

  it("falls back to credsStore when no credHelpers match", async () => {
    stubDockerConfig({
      credsStore: "gcloud",
    });
    mockCredHelperSuccess({ Username: "oauth2token", Secret: "ya29.token" });

    const result = await getDockerCredentials("gcr.io");

    expect(spawn).toHaveBeenCalledWith(
      "docker-credential-gcloud",
      ["get"],
      expect.objectContaining({ timeout: 5000 }),
    );
    expect(result).toEqual({ username: "oauth2token", secret: "ya29.token" });
  });

  it("decodes base64 auths entry as fallback", async () => {
    const encoded = Buffer.from("myuser:mypass").toString("base64");
    stubDockerConfig({
      auths: { "ghcr.io": { auth: encoded } },
    });

    const result = await getDockerCredentials("ghcr.io");

    expect(spawn).not.toHaveBeenCalled();
    expect(result).toEqual({ username: "myuser", secret: "mypass" });
  });

  it("returns undefined when no matching auth method found (anonymous)", async () => {
    stubDockerConfig({
      auths: { "docker.io": { auth: "dXNlcjpwYXNz" } },
    });

    const result = await getDockerCredentials("ghcr.io");

    expect(result).toBeUndefined();
  });

  it("uses correct binary name format: docker-credential-{name}", async () => {
    stubDockerConfig({
      credHelpers: { "gcr.io": "gcloud" },
    });
    mockCredHelperSuccess({ Username: "user", Secret: "token" });

    await getDockerCredentials("gcr.io");

    expect(spawn).toHaveBeenCalledWith(
      "docker-credential-gcloud",
      ["get"],
      expect.any(Object),
    );
  });

  it("returns undefined when credential helper fails", async () => {
    stubDockerConfig({
      credHelpers: { "ghcr.io": "desktop" },
    });
    mockCredHelperFailure(1, "credentials not found");

    const result = await getDockerCredentials("ghcr.io");
    expect(result).toBeUndefined();
  });

  it("prefers credHelpers over credsStore when both exist", async () => {
    stubDockerConfig({
      credHelpers: { "ghcr.io": "desktop" },
      credsStore: "gcloud",
    });
    mockCredHelperSuccess({ Username: "user", Secret: "pass" });

    await getDockerCredentials("ghcr.io");

    expect(spawn).toHaveBeenCalledWith(
      "docker-credential-desktop",
      ["get"],
      expect.any(Object),
    );
  });

  it("falls through credHelpers to credsStore when registry not in credHelpers", async () => {
    stubDockerConfig({
      credHelpers: { "docker.io": "desktop" },
      credsStore: "gcloud",
    });
    mockCredHelperSuccess({ Username: "user", Secret: "pass" });

    await getDockerCredentials("gcr.io");

    expect(spawn).toHaveBeenCalledWith(
      "docker-credential-gcloud",
      ["get"],
      expect.any(Object),
    );
  });
});

describe("parseWwwAuthenticate", () => {
  it("parses Bearer realm, service, scope from header", () => {
    const header =
      'Bearer realm="https://ghcr.io/token",service="ghcr.io",scope="repository:org/repo:pull"';
    const result = parseWwwAuthenticate(header);
    expect(result).toEqual({
      realm: "https://ghcr.io/token",
      service: "ghcr.io",
      scope: "repository:org/repo:pull",
    });
  });

  it("returns undefined for non-Bearer headers", () => {
    const header = "Basic realm=\"registry\"";
    const result = parseWwwAuthenticate(header);
    expect(result).toBeUndefined();
  });

  it("handles missing service/scope gracefully", () => {
    const header = 'Bearer realm="https://auth.docker.io/token"';
    const result = parseWwwAuthenticate(header);
    expect(result).toEqual({
      realm: "https://auth.docker.io/token",
      service: "",
      scope: "",
    });
  });

  it("handles missing scope with service present", () => {
    const header = 'Bearer realm="https://ghcr.io/token",service="ghcr.io"';
    const result = parseWwwAuthenticate(header);
    expect(result).toEqual({
      realm: "https://ghcr.io/token",
      service: "ghcr.io",
      scope: "",
    });
  });

  it("returns undefined for empty header", () => {
    expect(parseWwwAuthenticate("")).toBeUndefined();
  });
});
