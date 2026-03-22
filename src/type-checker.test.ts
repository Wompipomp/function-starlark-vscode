import { describe, it, expect } from "vitest";
import { checkDocument, DiagnosticDescriptor, SchemaMetadata } from "./type-checker";

function makeMetadata(
  name: string,
  fields: Array<{ name: string; type: string; required: boolean }>,
): SchemaMetadata {
  return { name, fields };
}

const accountSchema = makeMetadata("Account", [
  { name: "name", type: "string", required: true },
  { name: "location", type: "string", required: true },
  { name: "tags", type: "string", required: false },
]);

function getMetadata(symbolName: string): SchemaMetadata | undefined {
  if (symbolName === "Account") return accountSchema;
  return undefined;
}

describe("checkDocument - missing required fields", () => {
  it("returns a missing-field diagnostic for each omitted required field", () => {
    const text = `Account(name="foo")`;
    const imported = new Set(["Account"]);
    const ns = new Map<string, Set<string>>();

    const diags = checkDocument(text, imported, ns, getMetadata);
    const missing = diags.filter((d) => d.kind === "missing-field");

    expect(missing).toHaveLength(1);
    expect(missing[0].message).toBe(
      'Missing required field "location" in Account()',
    );
    expect(missing[0].line).toBe(0);
    // Squiggle should cover "Account" (chars 0-6)
    expect(missing[0].startChar).toBe(0);
    expect(missing[0].endChar).toBe(7);
  });

  it("reports multiple missing required fields individually", () => {
    const text = `Account(tags="t")`;
    const imported = new Set(["Account"]);
    const ns = new Map<string, Set<string>>();

    const diags = checkDocument(text, imported, ns, getMetadata);
    const missing = diags.filter((d) => d.kind === "missing-field");

    expect(missing).toHaveLength(2);
    const messages = missing.map((d) => d.message).sort();
    expect(messages).toEqual([
      'Missing required field "location" in Account()',
      'Missing required field "name" in Account()',
    ]);
  });

  it("returns no diagnostics when all required fields are provided", () => {
    const text = `Account(name="foo", location="us-east")`;
    const imported = new Set(["Account"]);
    const ns = new Map<string, Set<string>>();

    const diags = checkDocument(text, imported, ns, getMetadata);
    const missing = diags.filter((d) => d.kind === "missing-field");
    expect(missing).toHaveLength(0);
  });

  it("does not check unimported constructors", () => {
    const text = `Account(tags="t")`;
    const imported = new Set<string>(); // Account NOT imported
    const ns = new Map<string, Set<string>>();

    const diags = checkDocument(text, imported, ns, getMetadata);
    expect(diags).toHaveLength(0);
  });

  it("checks namespace-qualified calls and squiggle covers just the symbol name", () => {
    const text = `storage.Account(name="foo")`;
    const imported = new Set<string>();
    const ns = new Map<string, Set<string>>([
      ["storage", new Set(["Account"])],
    ]);

    const diags = checkDocument(text, imported, ns, getMetadata);
    const missing = diags.filter((d) => d.kind === "missing-field");

    expect(missing).toHaveLength(1);
    expect(missing[0].message).toBe(
      'Missing required field "location" in Account()',
    );
    // "storage.Account" starts at 0, "Account" starts at 8
    expect(missing[0].startChar).toBe(8);
    expect(missing[0].endChar).toBe(15);
  });
});
