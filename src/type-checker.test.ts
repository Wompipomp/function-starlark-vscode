import { describe, it, expect } from "vitest";
import { checkDocument, DiagnosticDescriptor, SchemaMetadata } from "./type-checker";

function makeMetadata(
  name: string,
  fields: Array<{ name: string; type: string; required: boolean; doc?: string; enum?: string[] }>,
): SchemaMetadata {
  return {
    name,
    doc: "",
    fields: fields.map(f => ({ ...f, doc: f.doc ?? "", enum: f.enum ?? [] })),
  };
}

const accountSchema = makeMetadata("Account", [
  { name: "name", type: "string", required: true },
  { name: "location", type: "string", required: true },
  { name: "tags", type: "string", required: false },
]);

const deploymentSchema = makeMetadata("Deployment", [
  { name: "name", type: "string", required: true },
  { name: "replicas", type: "int", required: false },
  { name: "paused", type: "bool", required: false },
  { name: "metadata", type: "ObjectMeta", required: false },
  { name: "config", type: "", required: false },
]);

function getMetadata(symbolName: string): SchemaMetadata | undefined {
  if (symbolName === "Account") return accountSchema;
  if (symbolName === "Deployment") return deploymentSchema;
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

describe("checkDocument - type mismatch", () => {
  it("detects int passed where string expected", () => {
    const text = `Account(name=42, location="us-east")`;
    const imported = new Set(["Account"]);
    const ns = new Map<string, Set<string>>();

    const diags = checkDocument(text, imported, ns, getMetadata);
    const mismatch = diags.filter((d) => d.kind === "type-mismatch");

    expect(mismatch).toHaveLength(1);
    expect(mismatch[0].message).toBe('Field "name" expects string, got int');
    // Squiggle should cover the value "42"
    expect(mismatch[0].line).toBe(0);
  });

  it("detects string passed where int expected", () => {
    const text = `Deployment(name="web", replicas="three")`;
    const imported = new Set(["Deployment"]);
    const ns = new Map<string, Set<string>>();

    const diags = checkDocument(text, imported, ns, getMetadata);
    const mismatch = diags.filter((d) => d.kind === "type-mismatch");

    expect(mismatch).toHaveLength(1);
    expect(mismatch[0].message).toBe('Field "replicas" expects int, got string');
  });

  it("detects int passed where bool expected", () => {
    const text = `Deployment(name="web", paused=42)`;
    const imported = new Set(["Deployment"]);
    const ns = new Map<string, Set<string>>();

    const diags = checkDocument(text, imported, ns, getMetadata);
    const mismatch = diags.filter((d) => d.kind === "type-mismatch");

    expect(mismatch).toHaveLength(1);
    expect(mismatch[0].message).toBe('Field "paused" expects bool, got int');
  });

  it("detects literal value passed where schema-typed field expected", () => {
    const text = `Deployment(name="web", metadata="bad")`;
    const imported = new Set(["Deployment"]);
    const ns = new Map<string, Set<string>>();

    const diags = checkDocument(text, imported, ns, getMetadata);
    const mismatch = diags.filter((d) => d.kind === "type-mismatch");

    expect(mismatch).toHaveLength(1);
    expect(mismatch[0].message).toBe(
      'Field "metadata" expects ObjectMeta, got string',
    );
  });

  it("skips variables and expressions (no false positives)", () => {
    const text = `Account(name=my_var, location=get_location())`;
    const imported = new Set(["Account"]);
    const ns = new Map<string, Set<string>>();

    const diags = checkDocument(text, imported, ns, getMetadata);
    const mismatch = diags.filter((d) => d.kind === "type-mismatch");
    expect(mismatch).toHaveLength(0);
  });

  it("accepts correct types with no diagnostics", () => {
    const text = `Deployment(name="web", replicas=3, paused=True)`;
    const imported = new Set(["Deployment"]);
    const ns = new Map<string, Set<string>>();

    const diags = checkDocument(text, imported, ns, getMetadata);
    const mismatch = diags.filter((d) => d.kind === "type-mismatch");
    expect(mismatch).toHaveLength(0);
  });

  it("skips fields with empty type (no type checking possible)", () => {
    const text = `Deployment(name="web", config=42)`;
    const imported = new Set(["Deployment"]);
    const ns = new Map<string, Set<string>>();

    const diags = checkDocument(text, imported, ns, getMetadata);
    const mismatch = diags.filter((d) => d.kind === "type-mismatch");
    expect(mismatch).toHaveLength(0);
  });

  it("detects bool literal True/False correctly", () => {
    const text = `Account(name=True, location=False)`;
    const imported = new Set(["Account"]);
    const ns = new Map<string, Set<string>>();

    const diags = checkDocument(text, imported, ns, getMetadata);
    const mismatch = diags.filter((d) => d.kind === "type-mismatch");
    expect(mismatch).toHaveLength(2);
  });

  it("detects None literal for type mismatch on required fields", () => {
    const text = `Account(name=None, location="us-east")`;
    const imported = new Set(["Account"]);
    const ns = new Map<string, Set<string>>();

    const diags = checkDocument(text, imported, ns, getMetadata);
    const mismatch = diags.filter((d) => d.kind === "type-mismatch");
    expect(mismatch).toHaveLength(1);
    expect(mismatch[0].message).toBe('Field "name" expects string, got None');
  });

  it("allows None for optional fields without type mismatch", () => {
    const text = `Deployment(name="web", replicas=None)`;
    const imported = new Set(["Deployment"]);
    const ns = new Map<string, Set<string>>();

    const diags = checkDocument(text, imported, ns, getMetadata);
    const mismatch = diags.filter((d) => d.kind === "type-mismatch");
    expect(mismatch).toHaveLength(0);
  });

  it("squiggle covers the offending value, not the field name", () => {
    const text = `Account(name=42, location="us-east")`;
    const imported = new Set(["Account"]);
    const ns = new Map<string, Set<string>>();

    const diags = checkDocument(text, imported, ns, getMetadata);
    const mismatch = diags.filter((d) => d.kind === "type-mismatch");

    expect(mismatch).toHaveLength(1);
    // "Account(name=" is 13 chars to value start, "42" starts at 13, ends at 15
    expect(mismatch[0].startChar).toBe(13);
    expect(mismatch[0].endChar).toBe(15);
  });
});

describe("checkDocument - unknown field", () => {
  it("detects unknown keyword argument (typo)", () => {
    const text = `Account(name="foo", locaiton="us-east")`;
    const imported = new Set(["Account"]);
    const ns = new Map<string, Set<string>>();

    const diags = checkDocument(text, imported, ns, getMetadata);
    const unknown = diags.filter((d) => d.kind === "unknown-field");

    expect(unknown).toHaveLength(1);
    expect(unknown[0].message).toBe('Unknown field "locaiton" in Account()');
  });

  it("squiggle covers the field name for unknown fields", () => {
    const text = `Account(name="foo", locaiton="us-east")`;
    const imported = new Set(["Account"]);
    const ns = new Map<string, Set<string>>();

    const diags = checkDocument(text, imported, ns, getMetadata);
    const unknown = diags.filter((d) => d.kind === "unknown-field");

    expect(unknown).toHaveLength(1);
    // "Account(name="foo", " is 20 chars, "locaiton" starts at 20
    expect(unknown[0].startChar).toBe(20);
    expect(unknown[0].endChar).toBe(28);
  });

  it("no unknown-field diagnostic for valid field names", () => {
    const text = `Account(name="foo", location="us-east", tags="t")`;
    const imported = new Set(["Account"]);
    const ns = new Map<string, Set<string>>();

    const diags = checkDocument(text, imported, ns, getMetadata);
    const unknown = diags.filter((d) => d.kind === "unknown-field");
    expect(unknown).toHaveLength(0);
  });

  it("handles multi-line constructor calls correctly", () => {
    const text = `Account(\n  name="foo",\n  location="bar"\n)`;
    const imported = new Set(["Account"]);
    const ns = new Map<string, Set<string>>();

    const diags = checkDocument(text, imported, ns, getMetadata);
    // All required fields provided, all fields valid -- no diagnostics
    expect(diags).toHaveLength(0);
  });

  it("detects unknown field in multi-line call", () => {
    const text = `Account(\n  name="foo",\n  locaiton="bar"\n)`;
    const imported = new Set(["Account"]);
    const ns = new Map<string, Set<string>>();

    const diags = checkDocument(text, imported, ns, getMetadata);
    const unknown = diags.filter((d) => d.kind === "unknown-field");
    const missing = diags.filter((d) => d.kind === "missing-field");

    expect(unknown).toHaveLength(1);
    expect(unknown[0].message).toBe('Unknown field "locaiton" in Account()');
    // "locaiton" is on line 2 (0-indexed)
    expect(unknown[0].line).toBe(2);

    // "location" is still missing since "locaiton" is not a known field
    expect(missing).toHaveLength(1);
    expect(missing[0].message).toBe(
      'Missing required field "location" in Account()',
    );
  });
});

describe("checkDocument - string and comment masking", () => {
  it("ignores constructor-like patterns inside string literals", () => {
    const text = `x = "Account(name=42)"\nAccount(name="foo", location="bar")`;
    const imported = new Set(["Account"]);
    const ns = new Map<string, Set<string>>();

    const diags = checkDocument(text, imported, ns, getMetadata);
    // Only the real call on line 1 should be checked, not the string content
    expect(diags.filter((d) => d.kind === "type-mismatch")).toHaveLength(0);
    expect(diags.filter((d) => d.kind === "missing-field")).toHaveLength(0);
  });

  it("ignores constructor-like patterns inside comments", () => {
    const text = `# Account()\nAccount(name="foo", location="bar")`;
    const imported = new Set(["Account"]);
    const ns = new Map<string, Set<string>>();

    const diags = checkDocument(text, imported, ns, getMetadata);
    expect(diags.filter((d) => d.kind === "missing-field")).toHaveLength(0);
  });

  it("ignores constructor-like patterns inside triple-quoted strings", () => {
    const text = `x = """Account(name=42)"""\nAccount(name="foo", location="bar")`;
    const imported = new Set(["Account"]);
    const ns = new Map<string, Set<string>>();

    const diags = checkDocument(text, imported, ns, getMetadata);
    expect(diags.filter((d) => d.kind === "type-mismatch")).toHaveLength(0);
    expect(diags.filter((d) => d.kind === "missing-field")).toHaveLength(0);
  });
});

// --- schemaName/fieldName on DiagnosticDescriptor ---

describe("checkDocument - schemaName and fieldName", () => {
  it("missing-field diagnostic carries schemaName and fieldName", () => {
    const text = `Account(name="foo")`;
    const imported = new Set(["Account"]);
    const ns = new Map<string, Set<string>>();

    const diags = checkDocument(text, imported, ns, getMetadata);
    const missing = diags.filter((d) => d.kind === "missing-field");

    expect(missing).toHaveLength(1);
    expect(missing[0].schemaName).toBe("Account");
    expect(missing[0].fieldName).toBe("location");
  });

  it("unknown-field diagnostic carries schemaName and fieldName is undefined", () => {
    const text = `Account(name="foo", locaiton="us-east")`;
    const imported = new Set(["Account"]);
    const ns = new Map<string, Set<string>>();

    const diags = checkDocument(text, imported, ns, getMetadata);
    const unknown = diags.filter((d) => d.kind === "unknown-field");

    expect(unknown).toHaveLength(1);
    expect(unknown[0].schemaName).toBe("Account");
    expect(unknown[0].fieldName).toBeUndefined();
  });

  it("type-mismatch diagnostic carries schemaName and fieldName", () => {
    const text = `Account(name=42, location="us-east")`;
    const imported = new Set(["Account"]);
    const ns = new Map<string, Set<string>>();

    const diags = checkDocument(text, imported, ns, getMetadata);
    const mismatch = diags.filter((d) => d.kind === "type-mismatch");

    expect(mismatch).toHaveLength(1);
    expect(mismatch[0].schemaName).toBe("Account");
    expect(mismatch[0].fieldName).toBe("name");
  });

  it("enum-mismatch diagnostic carries schemaName and fieldName", () => {
    const text = `PVC(accessMode="bad")`;
    const imported = new Set(["PVC"]);
    const ns = new Map<string, Set<string>>();

    const diags = checkDocument(text, imported, ns, getMetadataWithEnum);
    const enumDiags = diags.filter((d) => d.kind === "enum-mismatch");

    expect(enumDiags).toHaveLength(1);
    expect(enumDiags[0].schemaName).toBe("PVC");
    expect(enumDiags[0].fieldName).toBe("accessMode");
  });

  it("namespace-qualified calls use unqualified symbol name as schemaName", () => {
    const text = `storage.Account(name="foo")`;
    const imported = new Set<string>();
    const ns = new Map<string, Set<string>>([
      ["storage", new Set(["Account"])],
    ]);

    const diags = checkDocument(text, imported, ns, getMetadata);
    const missing = diags.filter((d) => d.kind === "missing-field");

    expect(missing).toHaveLength(1);
    expect(missing[0].schemaName).toBe("Account");
    expect(missing[0].fieldName).toBe("location");
  });
});

// --- Enum validation tests ---

const pvcSchema = makeMetadata("PVC", [
  { name: "accessMode", type: "string", required: false, enum: ["ReadWriteOnce", "ReadOnlyMany", "ReadWriteMany"] },
  { name: "storageClass", type: "string", required: false },
]);

const mixedSchema = makeMetadata("Mixed", [
  { name: "mode", type: "int", required: false, enum: ["read", "write"] },
]);

const untypedEnumSchema = makeMetadata("UntypedEnum", [
  { name: "level", type: "", required: false, enum: ["low", "medium", "high"] },
]);

function getMetadataWithEnum(symbolName: string): SchemaMetadata | undefined {
  if (symbolName === "Account") return accountSchema;
  if (symbolName === "Deployment") return deploymentSchema;
  if (symbolName === "PVC") return pvcSchema;
  if (symbolName === "Mixed") return mixedSchema;
  if (symbolName === "UntypedEnum") return untypedEnumSchema;
  return undefined;
}

describe("checkDocument - enum validation", () => {
  it("reports enum-mismatch for invalid string literal on enum field", () => {
    const text = `PVC(accessMode="ReadWrite")`;
    const imported = new Set(["PVC"]);
    const ns = new Map<string, Set<string>>();

    const diags = checkDocument(text, imported, ns, getMetadataWithEnum);
    const enumDiags = diags.filter((d) => d.kind === "enum-mismatch");

    expect(enumDiags).toHaveLength(1);
    expect(enumDiags[0].message).toBe(
      'Invalid value "ReadWrite" for field "accessMode" \u2014 allowed: "ReadWriteOnce", "ReadOnlyMany", "ReadWriteMany"',
    );
  });

  it("produces no diagnostic for valid enum value", () => {
    const text = `PVC(accessMode="ReadWriteOnce")`;
    const imported = new Set(["PVC"]);
    const ns = new Map<string, Set<string>>();

    const diags = checkDocument(text, imported, ns, getMetadataWithEnum);
    const enumDiags = diags.filter((d) => d.kind === "enum-mismatch");
    expect(enumDiags).toHaveLength(0);
  });

  it("produces no diagnostic for variable/expression on enum field", () => {
    const text = `PVC(accessMode=my_mode)`;
    const imported = new Set(["PVC"]);
    const ns = new Map<string, Set<string>>();

    const diags = checkDocument(text, imported, ns, getMetadataWithEnum);
    const enumDiags = diags.filter((d) => d.kind === "enum-mismatch");
    expect(enumDiags).toHaveLength(0);
  });

  it("produces no diagnostic for None on optional enum field", () => {
    const text = `PVC(accessMode=None)`;
    const imported = new Set(["PVC"]);
    const ns = new Map<string, Set<string>>();

    const diags = checkDocument(text, imported, ns, getMetadataWithEnum);
    const enumDiags = diags.filter((d) => d.kind === "enum-mismatch");
    expect(enumDiags).toHaveLength(0);
  });

  it("type-mismatch takes priority over enum-mismatch (no double diagnostics)", () => {
    // Mixed has type="int" and enum=["read", "write"] -- passing a string fails type check first
    const text = `Mixed(mode="read")`;
    const imported = new Set(["Mixed"]);
    const ns = new Map<string, Set<string>>();

    const diags = checkDocument(text, imported, ns, getMetadataWithEnum);
    const typeDiags = diags.filter((d) => d.kind === "type-mismatch");
    const enumDiags = diags.filter((d) => d.kind === "enum-mismatch");

    expect(typeDiags).toHaveLength(1);
    expect(enumDiags).toHaveLength(0);
  });

  it("reports enum-mismatch when field has no type= but has enum=", () => {
    const text = `UntypedEnum(level="critical")`;
    const imported = new Set(["UntypedEnum"]);
    const ns = new Map<string, Set<string>>();

    const diags = checkDocument(text, imported, ns, getMetadataWithEnum);
    const enumDiags = diags.filter((d) => d.kind === "enum-mismatch");

    expect(enumDiags).toHaveLength(1);
    expect(enumDiags[0].message).toBe(
      'Invalid value "critical" for field "level" \u2014 allowed: "low", "medium", "high"',
    );
  });

  it("squiggle covers the value text, not the field name", () => {
    const text = `PVC(accessMode="ReadWrite")`;
    const imported = new Set(["PVC"]);
    const ns = new Map<string, Set<string>>();

    const diags = checkDocument(text, imported, ns, getMetadataWithEnum);
    const enumDiags = diags.filter((d) => d.kind === "enum-mismatch");

    expect(enumDiags).toHaveLength(1);
    // 'PVC(accessMode=' is 15 chars, '"ReadWrite"' is 11 chars
    expect(enumDiags[0].startChar).toBe(15);
    expect(enumDiags[0].endChar).toBe(26);
  });

  it("diagnostic kind is enum-mismatch", () => {
    const text = `PVC(accessMode="bad")`;
    const imported = new Set(["PVC"]);
    const ns = new Map<string, Set<string>>();

    const diags = checkDocument(text, imported, ns, getMetadataWithEnum);
    const enumDiags = diags.filter((d) => d.kind === "enum-mismatch");

    expect(enumDiags).toHaveLength(1);
    expect(enumDiags[0].kind).toBe("enum-mismatch");
  });

  it("case-sensitive comparison: lowercase does not match PascalCase", () => {
    const text = `PVC(accessMode="readwriteonce")`;
    const imported = new Set(["PVC"]);
    const ns = new Map<string, Set<string>>();

    const diags = checkDocument(text, imported, ns, getMetadataWithEnum);
    const enumDiags = diags.filter((d) => d.kind === "enum-mismatch");
    expect(enumDiags).toHaveLength(1);
  });

  it("namespace-qualified constructor also validates enums", () => {
    const text = `storage.PVC(accessMode="bad")`;
    const imported = new Set<string>();
    const ns = new Map<string, Set<string>>([
      ["storage", new Set(["PVC"])],
    ]);

    const diags = checkDocument(text, imported, ns, getMetadataWithEnum);
    const enumDiags = diags.filter((d) => d.kind === "enum-mismatch");

    expect(enumDiags).toHaveLength(1);
    expect(enumDiags[0].message).toContain('Invalid value "bad"');
  });

  it("no enum diagnostic for field without enum constraint", () => {
    const text = `PVC(storageClass="gp2")`;
    const imported = new Set(["PVC"]);
    const ns = new Map<string, Set<string>>();

    const diags = checkDocument(text, imported, ns, getMetadataWithEnum);
    const enumDiags = diags.filter((d) => d.kind === "enum-mismatch");
    expect(enumDiags).toHaveLength(0);
  });
});
