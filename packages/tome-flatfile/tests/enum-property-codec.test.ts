import { describe, expect, test } from "bun:test";
import {
  decodePropertyLiteral,
  encodePropertyLiteral,
  encodeEnumProperties,
  decodeEnumProperties,
} from "../src/enum-property-codec";
import type { SchemaFile } from "../src/schema-rules/schema-file";

const TEST_SCHEMA: SchemaFile = {
  version: 1,
  relationshipRules: [],
  enums: {
    priority: {
      options: ["Consideration", "Low", "Medium", "High"],
      default: "Low",
      defaultOrder: "desc",
      values: { Low: 1, Medium: 2, High: 4, Consideration: 0 },
    },
  },
};

describe("enum-property-codec", () => {
  test("encodePropertyLiteral maps label to option index", () => {
    expect(encodePropertyLiteral("priority", "Consideration", TEST_SCHEMA)).toBe(0);
    expect(encodePropertyLiteral("priority", "High", TEST_SCHEMA)).toBe(3);
  });

  test("decodePropertyLiteral maps index to label", () => {
    expect(decodePropertyLiteral("priority", 0, TEST_SCHEMA)).toBe("Consideration");
    expect(decodePropertyLiteral("priority", 3, TEST_SCHEMA)).toBe("High");
  });

  test("passes through non-enum properties", () => {
    expect(encodePropertyLiteral("title", "Arc One", TEST_SCHEMA)).toBe("Arc One");
    expect(decodePropertyLiteral("title", "Arc One", TEST_SCHEMA)).toBe("Arc One");
  });

  test("encodeEnumProperties round-trips through decodeEnumProperties", () => {
    const encoded = encodeEnumProperties({ priority: "Medium", note: "x" }, TEST_SCHEMA);
    expect(encoded).toEqual({ priority: 2, note: "x" });
    const decoded = decodeEnumProperties(encoded, TEST_SCHEMA);
    expect(decoded).toEqual({ priority: "Medium", note: "x" });
  });
});
