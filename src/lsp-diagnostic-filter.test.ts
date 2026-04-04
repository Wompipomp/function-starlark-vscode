import { describe, it, expect } from "vitest";
import { isLspNoiseDiagnostic } from "./lsp-diagnostic-filter";

describe("isLspNoiseDiagnostic", () => {
  it('returns true for "no such file or directory"', () => {
    expect(isLspNoiseDiagnostic("no such file or directory")).toBe(true);
  });

  it('returns true for "only file URIs are supported, got oci"', () => {
    expect(
      isLspNoiseDiagnostic("only file URIs are supported, got oci"),
    ).toBe(true);
  });

  it('returns true for partial match "only file URIs are supported"', () => {
    expect(isLspNoiseDiagnostic("only file URIs are supported")).toBe(true);
  });

  it('returns false for real diagnostic "undefined variable foo"', () => {
    expect(isLspNoiseDiagnostic("undefined variable foo")).toBe(false);
  });

  it("returns false for empty message", () => {
    expect(isLspNoiseDiagnostic("")).toBe(false);
  });
});
