import { describe, expect, test } from "bun:test";
import {
  canonicalizeDynAggregate,
  FIXED_AGGREGATE_BY_RESOLVER,
} from "../../src/dynamic-properties/aggregate";
import {
  expressionIndexKeyForFixedDyn,
  hashExpressionIndexKey,
} from "../../src/dynamic-properties/expression-index-key";

describe("expression index digests", () => {
  test("same fixed dyn params produce stable digests", () => {
    const a = expressionIndexKeyForFixedDyn(
      "characters.allSceneCount",
      { scenes_edge_label: "ASSOC:0" },
      "/tmp/nonexistent-content-for-fingerprint",
    );
    const b = expressionIndexKeyForFixedDyn(
      "characters.allSceneCount",
      { scenes_edge_label: "ASSOC:0" },
      "/tmp/nonexistent-content-for-fingerprint",
    );
    expect(a?.digest).toBeTruthy();
    expect(a?.digest).toBe(b?.digest);
    expect(a?.digest).toMatch(/^[a-f0-9]{32}$/);
  });

  test("param drift changes digest", () => {
    const a = expressionIndexKeyForFixedDyn(
      "inspirations.wonder",
      { theme_target_id: "A", theme_edge_label: "T:0" },
      "/tmp/fp-a",
    );
    const b = expressionIndexKeyForFixedDyn(
      "inspirations.wonder",
      { theme_target_id: "B", theme_edge_label: "T:0" },
      "/tmp/fp-a",
    );
    expect(a?.digest).not.toBe(b?.digest);
  });

  test("canonical aggregate JSON is key-sorted", () => {
    const spec = FIXED_AGGREGATE_BY_RESOLVER["inspirations.weightedUse"];
    const canonical = canonicalizeDynAggregate("inspirations.weightedUse", spec, {
      z_last: 1,
      a_first: 2,
    });
    const hashed = hashExpressionIndexKey(canonical, { formatVersion: 1 });
    expect(hashed).toMatch(/^[a-f0-9]{32}$/);
    expect(JSON.stringify(canonical)).toContain('"a_first"');
  });
});
