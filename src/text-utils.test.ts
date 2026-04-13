import { describe, it, expect } from "vitest";
import { maskStringsAndComments } from "./text-utils";

describe("maskStringsAndComments", () => {
  it("replaces comment content with spaces, preserving length", () => {
    const input = "hello # Comment";
    const result = maskStringsAndComments(input);
    expect(result.length).toBe(input.length);
    // "hello " stays, "# Comment" becomes spaces
    expect(result).toBe("hello          ");
  });

  it("replaces double-quoted string contents with spaces", () => {
    const input = 'x = "Deployment()"';
    const result = maskStringsAndComments(input);
    expect(result.length).toBe(input.length);
    // Quotes and contents become spaces, code stays
    expect(result).toBe("x =               ");
  });

  it("replaces single-quoted string contents with spaces", () => {
    const input = "x = 'Resource()'";
    const result = maskStringsAndComments(input);
    expect(result.length).toBe(input.length);
    expect(result).toBe("x =             ");
  });

  it("replaces triple-quoted string contents with spaces", () => {
    const input = 'x = """triple"""';
    const result = maskStringsAndComments(input);
    expect(result.length).toBe(input.length);
    expect(result).toBe("x =             ");
  });

  it("handles escaped quotes correctly", () => {
    const input = 'x = "escaped\\"quote"';
    const result = maskStringsAndComments(input);
    expect(result.length).toBe(input.length);
    // The entire string including escaped quote is masked
    expect(result.startsWith("x = ")).toBe(true);
    // No quote characters should remain in the masked region
    expect(result.substring(4)).toBe("                ");
  });

  it("preserves newlines (offset-safe)", () => {
    const input = "line1\nline2";
    const result = maskStringsAndComments(input);
    expect(result.length).toBe(input.length);
    expect(result).toBe("line1\nline2");
  });

  it("preserves newlines inside triple-quoted strings", () => {
    const input = 'x = """hello\nworld"""';
    const result = maskStringsAndComments(input);
    expect(result.length).toBe(input.length);
    // Newline preserved, other chars become spaces
    expect(result).toBe("x =         \n        ");
  });

  it("output length always equals input length", () => {
    const inputs = [
      "hello # Comment",
      'x = "Deployment()"',
      "x = 'Resource()'",
      'x = """triple"""',
      'x = "escaped\\"quote"',
      "line1\nline2",
      '# full line comment\nx = "string" # inline comment',
    ];
    for (const input of inputs) {
      const result = maskStringsAndComments(input);
      expect(result.length).toBe(input.length);
    }
  });
});
