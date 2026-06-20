import { describe, expect, test } from "bun:test";
import { matchesTableNameFilter, filterRowsByName } from "../../src/webview/table-name-filter";

describe("matchesTableNameFilter", () => {
  test("matches case-insensitive substrings", () => {
    expect(matchesTableNameFilter("Quest Log", "quest")).toBe(true);
    expect(matchesTableNameFilter("Quest Log", "LOG")).toBe(true);
    expect(matchesTableNameFilter("Quest Log", "xyz")).toBe(false);
  });

  test("treats empty or whitespace query as matching all rows", () => {
    expect(matchesTableNameFilter("Anything", "")).toBe(true);
    expect(matchesTableNameFilter("Anything", "   ")).toBe(true);
  });
});

describe("filterRowsByName", () => {
  test("returns all rows when query is empty", () => {
    const rows = [{ name: "Alpha" }, { name: "Beta" }];
    expect(filterRowsByName(rows, "", (row) => row.name)).toEqual(rows);
    expect(filterRowsByName(rows, "  ", (row) => row.name)).toEqual(rows);
  });

  test("filters rows by trimmed query", () => {
    const rows = [{ name: "Alpha" }, { name: "Beta quest" }];
    expect(filterRowsByName(rows, " quest ", (row) => row.name)).toEqual([{ name: "Beta quest" }]);
  });

  test("sorts filtered rows by relevance when query is non-empty", () => {
    const rows = [{ name: "Applied Surrealism" }, { name: "Surreal" }, { name: "Unrelated" }];
    expect(filterRowsByName(rows, "Surreal", (row) => row.name).map((row) => row.name)).toEqual([
      "Surreal",
      "Applied Surrealism",
    ]);
  });
});
