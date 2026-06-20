import { describe, expect, test } from "bun:test";
import {
  layoutLinkDistance,
  nodeCollisionRadius,
  nodeDisplayValue,
  nodeRadius,
} from "../../src/webview/graph-node-layout";

describe("graph node layout", () => {
  test("cluster nodes grow with member count", () => {
    const small = nodeRadius({ val: 2, isCluster: true }, true);
    const large = nodeRadius({ val: 200, isCluster: true }, true);
    expect(large).toBeGreaterThan(small);
  });

  test("collision radius includes padding beyond draw radius", () => {
    const node = { val: 20, isCluster: true };
    expect(nodeCollisionRadius(node, true)).toBeGreaterThan(nodeRadius(node, true));
  });

  test("layoutLinkDistance accounts for both endpoint radii", () => {
    const source = { val: 50, isCluster: true };
    const target = { val: 10, isCluster: true };
    const distance = layoutLinkDistance(source, target, 90, true);
    expect(distance).toBe(
      90 + nodeCollisionRadius(source, true) + nodeCollisionRadius(target, true),
    );
  });

  test("record nodes use unit display value on fine layers", () => {
    expect(nodeDisplayValue({ val: 50 }, false)).toBe(1);
  });
});
