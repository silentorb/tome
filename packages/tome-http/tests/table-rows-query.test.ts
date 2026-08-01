import { describe, expect, test } from "bun:test";
import {
  appendTableRowsQueryParams,
  tableRowsQueryFromSearchParams,
} from "../src/table-rows-query";
import { DEFAULT_TABLE_ROW_LIMIT } from "tome-graph-interfaces";

describe("tableRowsQueryFromSearchParams", () => {
  test("defaults limit for editor fetches", () => {
    const query = tableRowsQueryFromSearchParams(new URLSearchParams());
    expect(query.limit).toBe(DEFAULT_TABLE_ROW_LIMIT);
    expect(query.offset).toBeUndefined();
  });

  test("parses limit, offset, q, and sorts JSON", () => {
    const params = new URLSearchParams({
      limit: "25",
      offset: "50",
      q: "quest",
      sorts: JSON.stringify([{ column: "name", direction: "desc" }]),
    });
    expect(tableRowsQueryFromSearchParams(params, { defaultLimit: null })).toEqual({
      limit: 25,
      offset: 50,
      q: "quest",
      sorts: [{ column: "name", direction: "desc" }],
    });
  });

  test("appendTableRowsQueryParams round-trips", () => {
    const params = new URLSearchParams();
    appendTableRowsQueryParams(params, {
      limit: 10,
      offset: 20,
      q: "a",
      sorts: [{ column: "priority", direction: "asc" }],
    });
    expect(tableRowsQueryFromSearchParams(params, { defaultLimit: null })).toEqual({
      limit: 10,
      offset: 20,
      q: "a",
      sorts: [{ column: "priority", direction: "asc" }],
    });
  });
});
