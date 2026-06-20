import { describe, expect, test } from "bun:test";
import {
  compareEnumLabels,
  decodeEnumProperties,
  encodeEnumProperties,
  indexToEnumLabel,
  labelToEnumIndex,
} from "../src/enum-codec";
import type { SchemaFile } from "../src/schema-rules/schema-file";

const TEST_SCHEMA: SchemaFile = {
  version: 1,
  relationshipRules: [],
  enums: {
    priority: {
      options: ["Low", "Medium", "High", "Consideration"],
      default: "Low",
      defaultOrder: "asc",
      values: { Low: 1, Medium: 2, High: 4, Consideration: 0 },
    },
  },
};

describe("enum-codec", () => {
  test("labelToEnumIndex and indexToEnumLabel round-trip", () => {
    const def = TEST_SCHEMA.enums.priority!;
    expect(labelToEnumIndex(def, "Medium")).toBe(1);
    expect(indexToEnumLabel(def, 1)).toBe("Medium");
    expect(indexToEnumLabel(def, 99)).toBe("Low");
  });

  test("compareEnumLabels uses options order, not values weights", () => {
    const def = TEST_SCHEMA.enums.priority!;
    expect(compareEnumLabels("High", "Medium", def)).toBeGreaterThan(0);
    expect(compareEnumLabels("Consideration", "High", def)).toBeGreaterThan(0);
    expect(compareEnumLabels("Low", "Consideration", def)).toBeLessThan(0);
  });

  test("encodeEnumProperties converts labels to indices", () => {
    expect(
      encodeEnumProperties({ priority: "High", row_index: 3 }, TEST_SCHEMA),
    ).toEqual({ priority: 2, row_index: 3 });
  });

  test("decodeEnumProperties converts indices to labels", () => {
    expect(decodeEnumProperties({ priority: 2, row_index: 3 }, TEST_SCHEMA)).toEqual({
      priority: "High",
      row_index: 3,
    });
  });

  test("decodeEnumProperties passes through legacy string labels", () => {
    expect(decodeEnumProperties({ priority: "Medium" }, TEST_SCHEMA)).toEqual({
      priority: "Medium",
    });
  });

  test("encode leaves already-valid indices unchanged", () => {
    expect(encodeEnumProperties({ priority: 2 }, TEST_SCHEMA)).toEqual({ priority: 2 });
  });
});
