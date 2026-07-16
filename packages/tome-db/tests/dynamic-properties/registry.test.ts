import { describe, expect, test } from "bun:test";
import { materializeColumnKey } from "../../src/dynamic-properties/registry";

describe("dynamic property registry helpers", () => {
  test("materializeColumnKey substitutes dimension placeholders", () => {
    expect(materializeColumnKey("count_{productId}", "book-1")).toBe("count_book-1");
    expect(materializeColumnKey("score_{dimensionId}", "scene-2")).toBe("score_scene-2");
  });
});
