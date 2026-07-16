import { describe, expect, test } from "bun:test";
import { applyViewPropertiesVisibility } from "../../src/views/column-visibility";

describe("applyViewPropertiesVisibility", () => {
  test("returns all columns when properties is absent or empty", () => {
    const result = applyViewPropertiesVisibility(["status", "priority", "type"], undefined);
    expect(result.visibleColumns).toEqual(["status", "priority", "type"]);
    expect(result.visibleSet).toEqual(new Set(["status", "priority", "type"]));
  });

  test("filters to listed keys in listed order", () => {
    const result = applyViewPropertiesVisibility(
      ["status", "priority", "type"],
      ["type", "status", "missing"],
    );
    expect(result.visibleColumns).toEqual(["type", "status"]);
    expect(result.visibleSet).toEqual(new Set(["type", "status"]));
  });
});
