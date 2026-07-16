import { describe, expect, test } from "bun:test";
import { applyViewProperties, reorderColumnDefs } from "../../src/views/column-order";

describe("applyViewProperties", () => {
  test("returns defaults when properties is absent or empty", () => {
    expect(applyViewProperties(["a", "b", "c"], undefined)).toEqual(["a", "b", "c"]);
    expect(applyViewProperties(["a", "b", "c"], [])).toEqual(["a", "b", "c"]);
  });

  test("returns only listed keys in listed order and drops stale keys", () => {
    expect(applyViewProperties(["a", "b", "c"], ["c", "missing", "a"])).toEqual(["c", "a"]);
  });

  test("does not append unlisted default keys", () => {
    expect(applyViewProperties(["a", "b", "c", "d"], ["c", "a"])).toEqual(["c", "a"]);
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
