import { describe, expect, test } from "bun:test";
import {
  DEFAULT_NODE_DIMENSION_SCALE,
  MAX_NODE_DIMENSION_SCALE,
  MIN_NODE_DIMENSION_SCALE,
  normalizeNodeDimensionScale,
  parseSpatialGraphConfig,
  resolveSpatialGraphConfig,
} from "../src/config";

describe("normalizeNodeDimensionScale", () => {
  test("returns defaults when partial is omitted", () => {
    expect(normalizeNodeDimensionScale()).toEqual(DEFAULT_NODE_DIMENSION_SCALE);
  });

  test("clamps axes to configured range", () => {
    expect(normalizeNodeDimensionScale({ x: 0.1, y: 10 })).toEqual({
      x: MIN_NODE_DIMENSION_SCALE,
      y: MAX_NODE_DIMENSION_SCALE,
    });
  });

  test("ignores invalid axis values", () => {
    expect(normalizeNodeDimensionScale({ x: NaN, y: -1 })).toEqual(DEFAULT_NODE_DIMENSION_SCALE);
  });
});

describe("resolveSpatialGraphConfig", () => {
  test("applies workspace nodeDimensionScale over defaults", () => {
    const config = resolveSpatialGraphConfig({}, { nodeDimensionScale: { x: 1.5, y: 2 } });
    expect(config.nodeDimensionScale).toEqual({ x: 1.5, y: 2 });
  });

  test("parseSpatialGraphConfig uses default scale", () => {
    const config = parseSpatialGraphConfig({});
    expect(config.nodeDimensionScale).toEqual(DEFAULT_NODE_DIMENSION_SCALE);
  });

  test("workspace partial scale merges with defaults per axis", () => {
    const config = resolveSpatialGraphConfig({}, { nodeDimensionScale: { x: 2 } });
    expect(config.nodeDimensionScale).toEqual({ x: 2, y: 1 });
  });
});
