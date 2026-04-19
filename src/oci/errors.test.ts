import { describe, it, expect } from "vitest";
import {
  OciDownloadError,
  classifyHttpStatus,
  wrapNetworkError,
} from "./errors";

describe("classifyHttpStatus", () => {
  it.each([
    [401, "auth"],
    [403, "auth"],
    [404, "notFound"],
    [500, "other"],
    [502, "other"],
    [418, "other"],
  ])("maps %i → %s", (status, kind) => {
    expect(classifyHttpStatus(status)).toBe(kind);
  });
});

describe("OciDownloadError", () => {
  it("exposes reference as host/repo:tag", () => {
    const err = new OciDownloadError({
      kind: "auth",
      message: "nope",
      registryHost: "registry.example.com",
      repository: "starlark-stdlib",
      tag: "v1.6.3",
      httpStatus: 401,
    });
    expect(err.reference).toBe("registry.example.com/starlark-stdlib:v1.6.3");
    expect(err.kind).toBe("auth");
    expect(err.httpStatus).toBe(401);
    expect(err.message).toBe("nope");
  });

  it("is instanceof Error so downstream catch(e: Error) still works", () => {
    const err = new OciDownloadError({
      kind: "other",
      message: "x",
      registryHost: "r",
      repository: "p",
      tag: "t",
    });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(OciDownloadError);
  });

  it("preserves cause for output-channel diagnostics", () => {
    const cause = new Error("original");
    const err = new OciDownloadError({
      kind: "network",
      message: "wrapped",
      registryHost: "r",
      repository: "p",
      tag: "t",
      cause,
    });
    expect(err.cause).toBe(cause);
  });
});

describe("wrapNetworkError", () => {
  it("classifies fetch rejections as kind=network", () => {
    const wrapped = wrapNetworkError(new Error("ECONNREFUSED"), {
      registryHost: "r.io",
      repository: "p",
      tag: "t",
    });
    expect(wrapped).toBeInstanceOf(OciDownloadError);
    expect(wrapped.kind).toBe("network");
    expect(wrapped.registryHost).toBe("r.io");
    expect(wrapped.message).toContain("Network error");
    expect(wrapped.message).toContain("ECONNREFUSED");
  });

  it("handles non-Error thrown values", () => {
    const wrapped = wrapNetworkError("boom", {
      registryHost: "r.io",
      repository: "p",
      tag: "t",
    });
    expect(wrapped.kind).toBe("network");
    expect(wrapped.message).toContain("boom");
  });
});
