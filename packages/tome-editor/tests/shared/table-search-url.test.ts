import { describe, expect, test } from "bun:test";
import { standaloneNodeUrl } from "../../src/shared/types";
import {
  itemsTableSearchParamKey,
  relationTableSearchParamKey,
  stripTableSearchParams,
  syncTableSearchParam,
  tableSearchFromLocation,
} from "../../src/shared/table-search-url";

describe("table search URL helpers", () => {
  test("builds scoped param keys", () => {
    expect(itemsTableSearchParamKey()).toBe("search_items");
    expect(relationTableSearchParamKey("RELATED")).toBe("search_RELATED");
  });

  test("reads and writes search params via location", () => {
    window.history.replaceState({}, "", "http://127.0.0.1:5173/?node=abc");
    syncTableSearchParam("search_items", "quest");
    expect(tableSearchFromLocation("search_items")).toBe("quest");
    expect(window.location.search).toContain("search_items=quest");

    syncTableSearchParam("search_items", "   ");
    expect(tableSearchFromLocation("search_items")).toBe("");
    expect(window.location.search).not.toContain("search_items=");
  });

  test("stripTableSearchParams removes all search_* params", () => {
    const url = new URL("http://127.0.0.1:5173/?node=abc&search_items=foo&search_RELATED=bar&tab=all");
    stripTableSearchParams(url);
    expect(url.searchParams.get("search_items")).toBeNull();
    expect(url.searchParams.get("search_RELATED")).toBeNull();
    expect(url.searchParams.get("tab")).toBe("all");
  });

  test("standaloneNodeUrl strips table search params", () => {
    const href = standaloneNodeUrl(
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "http://127.0.0.1:5173/?search_items=quest&search_RELATED=foo",
    );
    const url = new URL(href);
    expect(url.searchParams.get("node")).toBe("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(url.searchParams.get("search_items")).toBeNull();
    expect(url.searchParams.get("search_RELATED")).toBeNull();
  });
});
