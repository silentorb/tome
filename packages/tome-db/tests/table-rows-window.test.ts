import { describe, expect, test } from "bun:test";
import {
  applyNameFilterAndWindow,
  buildTableRowsWindow,
  filterRowsByName,
  matchesTableNameFilter,
  resolveWindowBounds,
} from "../src/table-rows-window";

describe("table-rows-window", () => {
  test("resolveWindowBounds treats omitted limit as full set", () => {
    expect(resolveWindowBounds(undefined)).toEqual({ offset: 0, limit: null });
    expect(resolveWindowBounds({})).toEqual({ offset: 0, limit: null });
    expect(resolveWindowBounds({ limit: 50, offset: 10 })).toEqual({ offset: 10, limit: 50 });
  });

  test("buildTableRowsWindow reports hasMore", () => {
    expect(buildTableRowsWindow(0, 50, 120)).toEqual({
      offset: 0,
      limit: 50,
      total: 120,
      hasMore: true,
    });
    expect(buildTableRowsWindow(100, 50, 120)).toEqual({
      offset: 100,
      limit: 50,
      total: 120,
      hasMore: false,
    });
    expect(buildTableRowsWindow(0, null, 12)).toEqual({
      offset: 0,
      limit: 12,
      total: 12,
      hasMore: false,
    });
  });

  test("applyNameFilterAndWindow filters by name and slices", () => {
    const rows = [
      { name: "Alpha quest" },
      { name: "Beta" },
      { name: "Gamma quest" },
      { name: "Delta" },
    ];
    const page = applyNameFilterAndWindow(rows, { q: "quest", limit: 1, offset: 0 }, (row) => row.name);
    expect(page.rowsWindow).toEqual({ offset: 0, limit: 1, total: 2, hasMore: true });
    expect(page.rows.map((row) => row.name)).toEqual(["Alpha quest"]);

    const next = applyNameFilterAndWindow(rows, { q: "quest", limit: 1, offset: 1 }, (row) => row.name);
    expect(next.rows.map((row) => row.name)).toEqual(["Gamma quest"]);
    expect(next.rowsWindow.hasMore).toBe(false);
  });

  test("matchesTableNameFilter and filterRowsByName stay available for callers", () => {
    expect(matchesTableNameFilter("Surreal", "sur")).toBe(true);
    expect(filterRowsByName([{ name: "A" }, { name: "B quest" }], "quest", (row) => row.name)).toEqual([
      { name: "B quest" },
    ]);
  });
});
