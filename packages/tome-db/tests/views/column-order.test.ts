import { describe, expect, test } from "bun:test";
import { applyColumnOrder, reorderColumnDefs } from "../../src/views/column-order";

describe("applyColumnOrder", () => {
  test("returns defaults when columnOrder is absent", () => {
    expect(applyColumnOrder(["a", "b", "c"], undefined)).toEqual(["a", "b", "c"]);
    expect(applyColumnOrder(["a", "b", "c"], [])).toEqual(["a", "b", "c"]);
  });

  test("reorders known keys and drops stale keys", () => {
    expect(applyColumnOrder(["a", "b", "c"], ["c", "missing", "a"])).toEqual(["c", "a", "b"]);
  });

  test("appends new default keys not listed in override", () => {
    expect(applyColumnOrder(["a", "b", "c", "d"], ["c", "a"])).toEqual(["c", "a", "b", "d"]);
  });
});

describe("reorderColumnDefs", () => {
  test("reorders defs to match column order", () => {
    const defs = [
      { key: "a", name: "A" },
      { key: "b", name: "B" },
      { key: "c", name: "C" },
    ];
    expect(reorderColumnDefs(defs, ["c", "a"]).map((def) => def.key)).toEqual(["c", "a", "b"]);
  });
});
