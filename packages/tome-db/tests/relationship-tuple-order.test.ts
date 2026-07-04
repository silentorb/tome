import { afterAll, describe, expect, test } from "bun:test";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestCompositeRelationships,
  seedTestNode,
  seedTestRelationships,
} from "../src/content/test-helpers";

/**
 * Step 1 regression: a relationship's relative semantics come from its authored
 * node-tuple order + the type registry — never from lexicographic node-id order.
 * Each case deliberately picks ids whose lexicographic order would invert the
 * intended direction if the old sortEndpoints behavior had survived.
 */
describe("relationship tuple order carries relative semantics", () => {
  const fixture = createTestContentFixture("tome-tuple-order-");
  const db = fixture.ctx.db;

  const targets = (nodeId: string, type: string) =>
    db.listRelationshipsFromSource(nodeId, type).map((r) => r.targetNodeId).sort();

  afterAll(() => destroyTestContentFixture(fixture));

  test("asymmetric parents_children orients by tuple order, not node-id order", () => {
    // parent sorts AFTER child; lexicographic ordering would flip parent/child.
    const parent = "ZZZZZZZZZZZZZZZZZZZZZZZZZZ";
    const child = "00000000000000000000000001";
    seedTestNode(fixture, { id: parent, properties: { title: "Parent" } });
    seedTestNode(fixture, { id: child, properties: { title: "Child" } });

    // perspectives = [children, parents]: index 0 emits "children", index 1 "parents".
    seedTestCompositeRelationships(fixture, [
      { a: parent, b: child, typeFromA: "children", typeFromB: "parents" },
    ]);

    expect(targets(parent, "children")).toEqual([child]);
    expect(targets(child, "parents")).toEqual([parent]);
    // The inverse perspectives must NOT appear on the wrong endpoints.
    expect(targets(parent, "parents")).toEqual([]);
    expect(targets(child, "children")).toEqual([]);
  });

  test("asymmetric scenes_product orients the same under either lexicographic layout", () => {
    // Edge 1: product sorts before scene. Edge 2: product sorts after scene.
    const productLow = "00000000000000000000000010";
    const sceneHigh = "ZZZZZZZZZZZZZZZZZZZZZZZZZ1";
    const productHigh = "ZZZZZZZZZZZZZZZZZZZZZZZZZ2";
    const sceneLow = "00000000000000000000000011";
    for (const [id, title] of [
      [productLow, "Product Low"],
      [sceneHigh, "Scene High"],
      [productHigh, "Product High"],
      [sceneLow, "Scene Low"],
    ] as const) {
      seedTestNode(fixture, { id, properties: { title } });
    }

    // perspectives = [scenes, product]: the product (index 0) emits "scenes".
    seedTestCompositeRelationships(fixture, [
      { a: productLow, b: sceneHigh, typeFromA: "scenes", typeFromB: "product" },
      { a: productHigh, b: sceneLow, typeFromA: "scenes", typeFromB: "product" },
    ]);

    expect(targets(productLow, "scenes")).toEqual([sceneHigh]);
    expect(targets(sceneHigh, "product")).toEqual([productLow]);
    expect(targets(productHigh, "scenes")).toEqual([sceneLow]);
    expect(targets(sceneLow, "product")).toEqual([productHigh]);
  });

  test("member_of / members derive from tuple order (member at index 0)", () => {
    // member sorts AFTER the set; lexicographic ordering would invert membership.
    const set = "00000000000000000000000002";
    const member = "ZZZZZZZZZZZZZZZZZZZZZZZZZY";
    seedTestNode(fixture, { id: set, properties: { title: "Set" } });
    seedTestNode(fixture, { id: member, properties: { title: "Member" } });

    seedTestRelationships(fixture, [
      { source: member, target: set, type: "member_of" },
    ]);

    expect(targets(member, "member_of")).toEqual([set]);
    expect(targets(set, "members")).toEqual([member]);
    expect(targets(set, "member_of")).toEqual([]);
    expect(targets(member, "members")).toEqual([]);
  });

  test("symmetric neighbor is order-agnostic", () => {
    const north = "00000000000000000000000003";
    const south = "ZZZZZZZZZZZZZZZZZZZZZZZZZX";
    seedTestNode(fixture, { id: north, properties: { title: "North" } });
    seedTestNode(fixture, { id: south, properties: { title: "South" } });

    seedTestCompositeRelationships(fixture, [
      { a: north, b: south, typeFromA: "neighbor", typeFromB: "neighbor" },
    ]);

    // Both endpoints project the same perspective in both directions.
    expect(targets(north, "neighbor")).toEqual([south]);
    expect(targets(south, "neighbor")).toEqual([north]);
  });
});
