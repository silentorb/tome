import { describe, expect, test } from "bun:test";
import {
  canonicalizeDynAggregate,
  COLUMN_SET_AGGREGATE_BY_RESOLVER,
  FIXED_AGGREGATE_BY_RESOLVER,
} from "../../src/dynamic-properties/aggregate";
import {
  expressionIndexKeyForColumnSetDyn,
  expressionIndexKeyForFixedDyn,
  hashExpressionIndexKey,
} from "../../src/dynamic-properties/expression-index-key";
import { parseDimensionIdFromColumnKey } from "../../src/dynamic-properties/registry";

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

  test("column-set digests bind dimensionId and stay stable", () => {
    const params = {
      scenes_edge_label: "SCENES",
      product_edge_label: "PRODUCT",
    };
    const contentDir = "/tmp/colset-fp";
    const a = expressionIndexKeyForColumnSetDyn(
      "characters.sceneCountByProduct",
      params,
      "01PRODUCTAAAAAAAAAAAAAAA1",
      contentDir,
    );
    const b = expressionIndexKeyForColumnSetDyn(
      "characters.sceneCountByProduct",
      params,
      "01PRODUCTAAAAAAAAAAAAAAA1",
      contentDir,
    );
    const other = expressionIndexKeyForColumnSetDyn(
      "characters.sceneCountByProduct",
      params,
      "01PRODUCTBBBBBBBBBBBBBBB1",
      contentDir,
    );
    expect(a?.digest).toBeTruthy();
    expect(a?.digest).toBe(b?.digest);
    expect(a?.digest).not.toBe(other?.digest);
    expect(COLUMN_SET_AGGREGATE_BY_RESOLVER["characters.sceneCountByProduct"].kind).toBe(
      "countReachWhereRelated",
    );
  });

  test("parseDimensionIdFromColumnKey inverts materialize patterns", () => {
    expect(
      parseDimensionIdFromColumnKey(
        "scene_count__{productId}",
        "scene_count__01PRODUCTAAAAAAAAAAAAAAA1",
      ),
    ).toBe("01PRODUCTAAAAAAAAAAAAAAA1");
    expect(parseDimensionIdFromColumnKey("scene_count__{productId}", "all_scene_count")).toBeNull();
    expect(parseDimensionIdFromColumnKey("{productId}__{dimensionId}", "a__b")).toBeNull();
  });
});
