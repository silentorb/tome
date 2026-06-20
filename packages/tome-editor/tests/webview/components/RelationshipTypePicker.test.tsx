import { describe, expect, test } from "bun:test";
import { filterAndSortRelationshipTypes } from "../../../src/webview/components/RelationshipTypePicker";

describe("filterAndSortRelationshipTypes", () => {
  test("returns types in source order when query is empty", () => {
    const types = ["zeta", "alpha", "mike"];
    expect(filterAndSortRelationshipTypes(types, "")).toEqual(types);
    expect(filterAndSortRelationshipTypes(types, "  ")).toEqual(types);
  });

  test("sorts filtered types by relevance when query is non-empty", () => {
    const types = ["applied_surrealism", "surreal", "features"];
    expect(filterAndSortRelationshipTypes(types, "surreal")).toEqual([
      "surreal",
      "applied_surrealism",
    ]);
  });
});
