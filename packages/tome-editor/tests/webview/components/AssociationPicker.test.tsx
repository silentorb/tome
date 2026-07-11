import { describe, expect, test } from "bun:test";
import { filterAndSortAssociations } from "../../../src/webview/components/AssociationPicker";

describe("filterAndSortAssociations", () => {
  test("returns types in source order when query is empty", () => {
    const types = ["zeta", "alpha", "mike"];
    expect(filterAndSortAssociations(types, "")).toEqual(types);
    expect(filterAndSortAssociations(types, "  ")).toEqual(types);
  });

  test("sorts filtered types by relevance when query is non-empty", () => {
    const types = ["applied_surrealism", "surreal", "features"];
    expect(filterAndSortAssociations(types, "surreal")).toEqual([
      "surreal",
      "applied_surrealism",
    ]);
  });
});
