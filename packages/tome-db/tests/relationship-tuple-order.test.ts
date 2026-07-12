import { afterAll, describe, expect, test } from "bun:test";
import { projectionTypeForEndpoint } from "tome-flatfile";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestCompositeRelationships,
  seedTestNode,
  seedTestRelationships,
  TEST_MEMBER_OF_ASSOCIATION_ID,
  TEST_PARENTS_CHILDREN_ASSOCIATION_ID,
  TEST_SCENES_PRODUCT_ASSOCIATION_ID,
} from "../src/content/test-helpers";

/**
 * Step 1 regression: a relationship's relative semantics come from its authored
 * node-tuple order + the type registry — never from lexicographic node-id order.
 * Each case deliberately picks ids whose lexicographic order would invert the
 * intended direction if the old sortEndpoints behavior had survived.
 */
describe("relationship tuple order carries relative semantics", () => {
  const fixture = createTestContentFixture("tome-tuple-order-");
  const db = fixture.ctx.cache;

  const targets = (nodeId: string, type: string) =>
    db.listRelationshipsFromSource(nodeId, type).map((r) => r.targetNodeId).sort();

  afterAll(() => destroyTestContentFixture(fixture));

  test("asymmetric parents_children orients by tuple order, not node-id order", () => {
    const parent = "ZZZZZZZZZZZZZZZZZZZZZZZZZZ";
    const child = "00000000000000000000000001";
    seedTestNode(fixture, { id: parent, properties: { title: "Parent" } });
    seedTestNode(fixture, { id: child, properties: { title: "Child" } });

    const [assocId] = seedTestCompositeRelationships(fixture, [
      {
        a: parent,
        b: child,
        typeFromA: "Children",
        typeFromB: "Parents",
        associationId: TEST_PARENTS_CHILDREN_ASSOCIATION_ID,
      },
    ]);
    const fromParent = projectionTypeForEndpoint(assocId!, 0);
    const fromChild = projectionTypeForEndpoint(assocId!, 1);

    expect(targets(parent, fromParent)).toEqual([child]);
    expect(targets(child, fromChild)).toEqual([parent]);
    expect(targets(parent, fromChild)).toEqual([]);
    expect(targets(child, fromParent)).toEqual([]);
  });

  test("asymmetric scenes_product orients the same under either lexicographic layout", () => {
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

    const [assocId] = seedTestCompositeRelationships(fixture, [
      {
        a: productLow,
        b: sceneHigh,
        typeFromA: "Scenes",
        typeFromB: "Product",
        associationId: TEST_SCENES_PRODUCT_ASSOCIATION_ID,
      },
      {
        a: productHigh,
        b: sceneLow,
        typeFromA: "Scenes",
        typeFromB: "Product",
        associationId: TEST_SCENES_PRODUCT_ASSOCIATION_ID,
      },
    ]);
    const fromProduct = projectionTypeForEndpoint(assocId!, 0);
    const fromScene = projectionTypeForEndpoint(assocId!, 1);

    expect(targets(productLow, fromProduct)).toEqual([sceneHigh]);
    expect(targets(sceneHigh, fromScene)).toEqual([productLow]);
    expect(targets(productHigh, fromProduct)).toEqual([sceneLow]);
    expect(targets(sceneLow, fromScene)).toEqual([productHigh]);
  });

  test("member_of / members derive from tuple order (parent at index 0)", () => {
    const set = "00000000000000000000000002";
    const member = "ZZZZZZZZZZZZZZZZZZZZZZZZZY";
    seedTestNode(fixture, { id: set, properties: { title: "Set" } });
    seedTestNode(fixture, { id: member, properties: { title: "Member" } });

    seedTestRelationships(fixture, [
      { source: member, target: set, type: TEST_MEMBER_OF_ASSOCIATION_ID },
    ]);

    const memberSide = projectionTypeForEndpoint(TEST_MEMBER_OF_ASSOCIATION_ID, 1);
    const setSide = projectionTypeForEndpoint(TEST_MEMBER_OF_ASSOCIATION_ID, 0);

    expect(targets(member, memberSide)).toEqual([set]);
    expect(targets(set, setSide)).toEqual([member]);
    expect(targets(set, memberSide)).toEqual([]);
    expect(targets(member, setSide)).toEqual([]);
  });

  test("symmetric neighbor is order-agnostic", () => {
    const north = "00000000000000000000000003";
    const south = "ZZZZZZZZZZZZZZZZZZZZZZZZZX";
    seedTestNode(fixture, { id: north, properties: { title: "North" } });
    seedTestNode(fixture, { id: south, properties: { title: "South" } });

    const [assocId] = seedTestCompositeRelationships(fixture, [
      { a: north, b: south, typeFromA: "Neighbor", typeFromB: "Neighbor" },
    ]);
    const p0 = projectionTypeForEndpoint(assocId!, 0);
    const p1 = projectionTypeForEndpoint(assocId!, 1);

    expect(targets(north, p0)).toEqual([south]);
    expect(targets(south, p1)).toEqual([north]);
  });
});
