import { describe, expect, test } from "bun:test";
import { applyHiddenColumns } from "../../src/views/column-visibility";

describe("applyHiddenColumns", () => {
  test("returns all columns when hiddenColumns is empty", () => {
    const result = applyHiddenColumns(["status", "priority", "type"], undefined);
    expect(result.visibleColumns).toEqual(["status", "priority", "type"]);
    expect(result.hiddenSet.size).toBe(0);
  });

  test("filters hidden keys from ordered columns", () => {
    const result = applyHiddenColumns(
      ["status", "priority", "type"],
      ["priority", "missing"],
    );
    expect(result.visibleColumns).toEqual(["status", "type"]);
    expect(result.hiddenSet.has("priority")).toBe(true);
  });
});
