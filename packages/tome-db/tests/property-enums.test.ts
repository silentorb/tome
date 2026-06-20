import { describe, expect, test } from "bun:test";
import type { SchemaFile } from "../src/schema-rules/schema-file";
import {
  comparePriorityLabels,
  getPriorityOptions,
  coalescePriorityValue,
  enrichColumnDef,
  isPriorityValue,
  priorityWeight,
  resolvePriorityEnum,
} from "../src/property-enums";

const TEST_SCHEMA: SchemaFile = {
  version: 1,
  relationshipRules: [],
  enums: {
    priority: {
      options: ["Low", "Medium", "High", "Consideration"],
      default: "Low",
      defaultOrder: "desc",
      values: {
        Low: 1,
        Medium: 2,
        High: 4,
        Consideration: 0,
      },
    },
  },
};

describe("property-enums", () => {
  test("priorityWeight maps labels to weights from schema values", () => {
    expect(priorityWeight("High")).toBe(4);
    expect(priorityWeight("Medium")).toBe(2);
    expect(priorityWeight("Consideration")).toBe(0);
    expect(priorityWeight("")).toBe(1);
    expect(priorityWeight("unknown")).toBe(0);
  });

  test("comparePriorityLabels orders by weight, not alphabetically", () => {
    expect(comparePriorityLabels("High", "Medium")).toBeGreaterThan(0);
    expect(comparePriorityLabels("Medium", "High")).toBeLessThan(0);
    expect(comparePriorityLabels("Low", "Consideration")).toBeGreaterThan(0);
  });

  test("coalescePriorityValue defaults unset to Low", () => {
    expect(coalescePriorityValue("")).toBe("Low");
    expect(coalescePriorityValue(undefined)).toBe("Low");
    expect(coalescePriorityValue("High")).toBe("High");
  });

  test("isPriorityValue accepts canonical options only", () => {
    expect(isPriorityValue("High")).toBe(true);
    expect(isPriorityValue("Ultimate")).toBe(false);
    expect(isPriorityValue("4")).toBe(false);
  });

  test("resolvePriorityEnum reads inline schema", () => {
    const def = resolvePriorityEnum(TEST_SCHEMA);
    expect(def.options).toEqual(["Low", "Medium", "High", "Consideration"]);
    expect(def.default).toBe("Low");
    expect(def.values?.High).toBe(4);
  });

  test("enrichColumnDef adds enum metadata for priority columns", () => {
    const enriched = enrichColumnDef(
      { key: "priority", name: "Priority", type: "select" },
      TEST_SCHEMA,
    );
    expect(enriched.type).toBe("enum");
    expect(enriched.enumId).toBe("priority");
    expect(enriched.options).toEqual(["Low", "Medium", "High", "Consideration"]);
    expect(enriched.defaultValue).toBe("Low");
    expect(enriched.defaultOrder).toBe("desc");
  });

  test("enrichColumnDef honors explicit enumId when column key differs", () => {
    const schema: SchemaFile = {
      ...TEST_SCHEMA,
      enums: {
        ...TEST_SCHEMA.enums,
        yes_no: {
          options: ["True", "False"],
          default: "False",
          defaultOrder: "asc",
        },
      },
    };
    const enriched = enrichColumnDef(
      {
        key: "plot_is_driven_by_mc_desire",
        name: "Plot is driven by MC desire",
        type: "select",
        enumId: "yes_no",
      },
      schema,
    );
    expect(enriched.type).toBe("enum");
    expect(enriched.enumId).toBe("yes_no");
    expect(enriched.options).toEqual(["True", "False"]);
    expect(enriched.defaultValue).toBe("False");
  });
});
