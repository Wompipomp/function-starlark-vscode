import { describe, it, expect } from "vitest";
import { parseSchemas, generateStub, parseFunctions, generateFunctionStub, extractEnumParam, extractTypeParam } from "./schema-stubs";

describe("parseSchemas", () => {
  it("parses a simple schema with fields", () => {
    const content = `Deployment = schema(
    "Deployment",
    doc="A Deployment provides declarative updates.",
    replicas=field(type="int", doc="int - Number of desired pods."),
    selector=field(type=LabelSelector, required=True, doc="LabelSelector - Label query."),
)`;
    const schemas = parseSchemas(content);
    expect(schemas).toHaveLength(1);
    expect(schemas[0].name).toBe("Deployment");
    expect(schemas[0].doc).toBe("A Deployment provides declarative updates.");
    expect(schemas[0].fields).toHaveLength(2);
    expect(schemas[0].fields[0]).toEqual({
      name: "replicas",
      type: "int",
      required: false,
      doc: "int - Number of desired pods.",
      enum: [],
    });
    expect(schemas[0].fields[1]).toEqual({
      name: "selector",
      type: "LabelSelector",
      required: true,
      doc: "LabelSelector - Label query.",
      enum: [],
    });
  });

  it("parses multiple schemas from one file", () => {
    const content = `A = schema(
    "A",
    doc="First schema.",
    x=field(type="string", doc="string - A field."),
)

B = schema(
    "B",
    doc="Second schema.",
    y=field(type="int", required=True, doc="int - Another field."),
)`;
    const schemas = parseSchemas(content);
    expect(schemas).toHaveLength(2);
    expect(schemas[0].name).toBe("A");
    expect(schemas[1].name).toBe("B");
  });

  it("handles schema with no doc", () => {
    const content = `Simple = schema(
    "Simple",
    name=field(type="string", doc="string - The name."),
)`;
    const schemas = parseSchemas(content);
    expect(schemas).toHaveLength(1);
    expect(schemas[0].doc).toBe("");
  });

  it("handles escaped quotes in doc strings", () => {
    const content = `Thing = schema(
    "Thing",
    doc="A \\"quoted\\" thing.",
    x=field(type="string", doc="string - Has \\"quotes\\"."),
)`;
    const schemas = parseSchemas(content);
    expect(schemas[0].doc).toBe('A "quoted" thing.');
    expect(schemas[0].fields[0].doc).toBe('string - Has "quotes".');
  });

  it("handles field with empty type", () => {
    const content = `IntOrString = schema(
    "IntOrString",
    doc="A type that can hold int or string.",
    value=field(type="", doc="The value."),
)`;
    const schemas = parseSchemas(content);
    expect(schemas[0].fields[0].type).toBe("");
  });

  it("skips load() statements and non-schema content", () => {
    const content = `load("other:v1/file.star", "Foo")

x = 42

MySchema = schema(
    "MySchema",
    doc="Only schema.",
    a=field(type="string", doc="string - A."),
)`;
    const schemas = parseSchemas(content);
    expect(schemas).toHaveLength(1);
    expect(schemas[0].name).toBe("MySchema");
  });
});

describe("generateStub", () => {
  it("generates Python def with docstring and args", () => {
    const schemas = [
      {
        name: "Deployment",
        doc: "A Deployment provides declarative updates.",
        fields: [
          { name: "replicas", type: "int", required: false, doc: "int - Number of desired pods.", enum: [] },
          { name: "selector", type: "LabelSelector", required: true, doc: "LabelSelector - Label query over resources.", enum: [] },
        ],
      },
    ];
    const stub = generateStub(schemas);
    expect(stub).toContain("def Deployment(selector, replicas=None):");
    expect(stub).toContain('"""A Deployment provides declarative updates.');
    expect(stub).toContain("    Args:");
    expect(stub).toContain("        replicas(int): Number of desired pods.");
    expect(stub).toContain("        selector(LabelSelector) [required]: Label query over resources.");
    expect(stub).toContain("    pass");
  });

  it("generates stubs for multiple schemas", () => {
    const schemas = [
      { name: "A", doc: "First.", fields: [] },
      { name: "B", doc: "Second.", fields: [{ name: "x", type: "string", required: false, doc: "string - X.", enum: [] }] },
    ];
    const stub = generateStub(schemas);
    expect(stub).toContain("def A():");
    expect(stub).toContain("def B(x=None):");
  });
});

describe("parseFunctions", () => {
  it("parses a simple top-level function", () => {
    const content = `def resource_name(oxr, suffix=""):
    return get(oxr, "metadata.name") + suffix`;
    const fns = parseFunctions(content);
    expect(fns).toHaveLength(1);
    expect(fns[0].name).toBe("resource_name");
    expect(fns[0].params).toBe('oxr, suffix=""');
    expect(fns[0].doc).toBe("");
  });

  it("extracts single-line docstring", () => {
    const content = `def resource_name(oxr):
    """Generate a resource name from the composite resource."""
    return oxr`;
    const fns = parseFunctions(content);
    expect(fns).toHaveLength(1);
    expect(fns[0].doc).toBe("Generate a resource name from the composite resource.");
  });

  it("extracts multi-line docstring", () => {
    const content = `def resource_name(oxr):
    """Generate a resource name.

    Args:
        oxr: The composite resource.
    """
    return oxr`;
    const fns = parseFunctions(content);
    expect(fns).toHaveLength(1);
    expect(fns[0].doc).toContain("Generate a resource name.");
    expect(fns[0].doc).toContain("Args:");
    expect(fns[0].doc).toContain("oxr: The composite resource.");
  });

  it("parses multiple functions", () => {
    const content = `def foo():
    pass

def bar(x, y):
    pass`;
    const fns = parseFunctions(content);
    expect(fns).toHaveLength(2);
    expect(fns[0].name).toBe("foo");
    expect(fns[1].name).toBe("bar");
    expect(fns[1].params).toBe("x, y");
  });

  it("ignores indented (nested) defs", () => {
    const content = `def outer():
    def inner():
        pass
    return inner`;
    const fns = parseFunctions(content);
    expect(fns).toHaveLength(1);
    expect(fns[0].name).toBe("outer");
  });

  it("strips trailing comma from params", () => {
    const content = `def foo(a, b,):
    pass`;
    const fns = parseFunctions(content);
    expect(fns[0].params).toBe("a, b");
  });

  it("handles multi-line parameter lists", () => {
    const content = `def resource_name(
    oxr,
    suffix="",
):
    """Generate a resource name."""
    return oxr`;
    const fns = parseFunctions(content);
    expect(fns).toHaveLength(1);
    expect(fns[0].name).toBe("resource_name");
    expect(fns[0].params).toBe('oxr, suffix=""');
    expect(fns[0].doc).toBe("Generate a resource name.");
  });
});

describe("generateFunctionStub", () => {
  it("generates Python def with docstring", () => {
    const fns = [{ name: "resource_name", params: 'oxr, suffix=""', doc: "Generate a resource name." }];
    const stub = generateFunctionStub(fns);
    expect(stub).toContain('def resource_name(oxr, suffix=""):');
    expect(stub).toContain('"""Generate a resource name."""');
    expect(stub).toContain("    pass");
  });

  it("generates def without docstring", () => {
    const fns = [{ name: "helper", params: "x", doc: "" }];
    const stub = generateFunctionStub(fns);
    expect(stub).toContain("def helper(x):");
    expect(stub).not.toContain('"""');
    expect(stub).toContain("    pass");
  });

  it("returns empty string for no functions", () => {
    expect(generateFunctionStub([])).toBe("");
  });
});

describe("extractEnumParam", () => {
  it("extracts multiple enum values from field body", () => {
    const fieldText = `type="string", enum=["ReadWriteOnce", "ReadOnlyMany"], doc="Access mode."`;
    expect(extractEnumParam(fieldText)).toEqual(["ReadWriteOnce", "ReadOnlyMany"]);
  });

  it("returns empty array when no enum param present", () => {
    const fieldText = `type="string", doc="No enum."`;
    expect(extractEnumParam(fieldText)).toEqual([]);
  });

  it("returns empty array for empty enum list", () => {
    const fieldText = `type="string", enum=[]`;
    expect(extractEnumParam(fieldText)).toEqual([]);
  });

  it("extracts single enum value", () => {
    const fieldText = `type="string", enum=["only"]`;
    expect(extractEnumParam(fieldText)).toEqual(["only"]);
  });
});

describe("parseSchemas - enum support", () => {
  it("populates ParsedField.enum for fields with enum parameter", () => {
    const content = `PVC = schema(
    "PVC",
    doc="A PVC.",
    accessMode=field(type="string", enum=["ReadWriteOnce", "ReadOnlyMany", "ReadWriteMany"], doc="Access mode."),
)`;
    const schemas = parseSchemas(content);
    expect(schemas).toHaveLength(1);
    expect(schemas[0].fields[0].enum).toEqual(["ReadWriteOnce", "ReadOnlyMany", "ReadWriteMany"]);
  });

  it("populates empty enum array for fields without enum parameter", () => {
    const content = `Simple = schema(
    "Simple",
    doc="Simple.",
    title=field(type="string", doc="The title."),
)`;
    const schemas = parseSchemas(content);
    expect(schemas[0].fields[0].enum).toEqual([]);
  });
});

describe("generateStub - enum hover docs", () => {
  it("appends Allowed values to Args line for enum fields", () => {
    const schemas = [{
      name: "PVC",
      doc: "A PVC.",
      fields: [
        { name: "accessMode", type: "string", required: false, doc: "string - Access mode.", enum: ["ReadWriteOnce", "ReadOnlyMany"] },
      ],
    }];
    const stub = generateStub(schemas);
    expect(stub).toContain('Allowed: "ReadWriteOnce", "ReadOnlyMany"');
  });

  it("combines doc and enum with separator", () => {
    const schemas = [{
      name: "PVC",
      doc: "A PVC.",
      fields: [
        { name: "accessMode", type: "string", required: false, doc: "string - Access mode.", enum: ["ReadWriteOnce", "ReadOnlyMany"] },
      ],
    }];
    const stub = generateStub(schemas);
    expect(stub).toContain('Access mode. Allowed: "ReadWriteOnce", "ReadOnlyMany"');
  });

  it("shows only Allowed when field has no doc", () => {
    const schemas = [{
      name: "PVC",
      doc: "A PVC.",
      fields: [
        { name: "accessMode", type: "string", required: false, doc: "", enum: ["ReadWriteOnce"] },
      ],
    }];
    const stub = generateStub(schemas);
    expect(stub).toContain('accessMode(string): Allowed: "ReadWriteOnce"');
  });

  it("produces unchanged Args line when no enum values", () => {
    const schemas = [{
      name: "PVC",
      doc: "A PVC.",
      fields: [
        { name: "storageClass", type: "string", required: false, doc: "string - Storage class.", enum: [] },
      ],
    }];
    const stub = generateStub(schemas);
    expect(stub).not.toContain("Allowed:");
    expect(stub).toContain("storageClass(string): Storage class.");
  });
});

describe("extractEnumParam - multi-line and single-quoted", () => {
  it("extracts enum values from multi-line array", () => {
    const fieldText = `type="string", enum=[
  "ReadWriteOnce",
  "ReadOnlyMany",
  "ReadWriteMany"
], doc="Access mode."`;
    expect(extractEnumParam(fieldText)).toEqual(["ReadWriteOnce", "ReadOnlyMany", "ReadWriteMany"]);
  });

  it("extracts single-quoted enum values", () => {
    const fieldText = `type="string", enum=['ReadWriteOnce', 'ReadOnlyMany']`;
    expect(extractEnumParam(fieldText)).toEqual(["ReadWriteOnce", "ReadOnlyMany"]);
  });

  it("extracts mixed-quote enum values", () => {
    const fieldText = `type="string", enum=["ReadWriteOnce", 'ReadOnlyMany']`;
    expect(extractEnumParam(fieldText)).toEqual(["ReadWriteOnce", "ReadOnlyMany"]);
  });
});

describe("extractTypeParam", () => {
  it("extracts single-quoted type value", () => {
    expect(extractTypeParam(`type='string'`)).toBe("string");
  });

  it("extracts double-quoted type value (regression)", () => {
    expect(extractTypeParam(`type="string"`)).toBe("string");
  });

  it("extracts bare reference type value (regression)", () => {
    expect(extractTypeParam(`type=ObjectMeta`)).toBe("ObjectMeta");
  });
});

describe("parseSchemas - multi-line and single-quoted", () => {
  it("populates enum from multi-line field() definition", () => {
    const content = `PVC = schema(
    "PVC",
    doc="A PVC.",
    accessMode=field(
        type="string",
        enum=[
            "ReadWriteOnce",
            "ReadOnlyMany",
            "ReadWriteMany",
        ],
        doc="Access mode.",
    ),
)`;
    const schemas = parseSchemas(content);
    expect(schemas).toHaveLength(1);
    expect(schemas[0].fields[0].enum).toEqual(["ReadWriteOnce", "ReadOnlyMany", "ReadWriteMany"]);
  });

  it("populates type from single-quoted type= parameter", () => {
    const content = `Simple = schema(
    "Simple",
    doc="Simple.",
    name=field(type='string', doc='The name.'),
)`;
    const schemas = parseSchemas(content);
    expect(schemas).toHaveLength(1);
    expect(schemas[0].fields[0].type).toBe("string");
  });

  it("populates doc from single-quoted doc= parameter", () => {
    const content = `Simple = schema(
    "Simple",
    doc="Simple.",
    name=field(type='string', doc='The name.'),
)`;
    const schemas = parseSchemas(content);
    expect(schemas[0].fields[0].doc).toBe("The name.");
  });
});
