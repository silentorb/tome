import { afterAll, describe, expect, test } from "bun:test";
import { projectionTypeForEndpoint } from "tome-flatfile";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestCompositeRelationships,
  seedTestNode,
  seedTestRelationships,
  TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID,
  TEST_PARENTS_CHILDREN_ASSOCIATION_ID,
  TEST_SCENES_PRODUCT_RELATIONSHIP_TYPE_ID,
} from "../src/content/test-helpers";

/**
 * Step 1 regression: a relationship's relative semantics come from its authored
 * node-tuple order + the type registry — never from lexicographic node-id order.
 * Each case deliberately picks ids whose lexicographic order would invert the
 * intended direction if the old sortEndpoints behavior had survived.
 */
describe("relationship tuple order carries relative semantics", async () => {
  const fixture = await createTestContentFixture("tome-tuple-order-");
  const db = fixture.ctx.cache;

  const targets = async (nodeId: string, type: string) =>
    (await db.listRelationshipsFromSource(nodeId, type)).map((r) => r.targetNodeId).sort();

  afterAll(async () => await destroyTestContentFixture(fixture));

  test("asymmetric parents_children orients by tuple order, not node-id order", async () => {
    const parent = "ZZZZZZZZZZZZZZZZZZZZZZZZZZ";
    const child = "00000000000000000000000001";
    await seedTestNode(fixture, { id: parent, properties: { title: "Parent" } });
    await seedTestNode(fixture, { id: child, properties: { title: "Child" } });

    const [assocId] = await seedTestCompositeRelationships(fixture, [
      {
        a: parent,
        b: child,
        typeFromA: "Children",
        typeFromB: "Parents",
        relationshipTypeId: TEST_PARENTS_CHILDREN_ASSOCIATION_ID,
      },
    ]);
    const fromParent = projectionTypeForEndpoint(assocId!, 0);
    const fromChild = projectionTypeForEndpoint(assocId!, 1);

    expect(await targets(parent, fromParent)).toEqual([child]);
    expect(await targets(child, fromChild)).toEqual([parent]);
    expect(await targets(parent, fromChild)).toEqual([]);
    expect(await targets(child, fromParent)).toEqual([]);
  });

  test("asymmetric scenes_product orients the same under either lexicographic layout", async () => {
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
      await seedTestNode(fixture, { id, properties: { title } });
    }

    const [assocId] = await seedTestCompositeRelationships(fixture, [
      {
        a: productLow,
        b: sceneHigh,
        typeFromA: "Scenes",
        typeFromB: "Product",
        relationshipTypeId: TEST_SCENES_PRODUCT_RELATIONSHIP_TYPE_ID,
      },
      {
        a: productHigh,
        b: sceneLow,
        typeFromA: "Scenes",
        typeFromB: "Product",
        relationshipTypeId: TEST_SCENES_PRODUCT_RELATIONSHIP_TYPE_ID,
      },
    ]);
    const fromProduct = projectionTypeForEndpoint(assocId!, 0);
    const fromScene = projectionTypeForEndpoint(assocId!, 1);

    expect(await targets(productLow, fromProduct)).toEqual([sceneHigh]);
    expect(await targets(sceneHigh, fromScene)).toEqual([productLow]);
    expect(await targets(productHigh, fromProduct)).toEqual([sceneLow]);
    expect(await targets(sceneLow, fromScene)).toEqual([productHigh]);
  });

  test("member_of / members derive from tuple order (parent at index 0)", async () => {
    const set = "00000000000000000000000002";
    const member = "ZZZZZZZZZZZZZZZZZZZZZZZZZY";
    await seedTestNode(fixture, { id: set, properties: { title: "Set" } });
    await seedTestNode(fixture, { id: member, properties: { title: "Member" } });

    await seedTestRelationships(fixture, [
      { source: member, target: set, type: TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID },
    ]);

    const memberSide = projectionTypeForEndpoint(TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID, 1);
    const setSide = projectionTypeForEndpoint(TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID, 0);

    expect(await targets(member, memberSide)).toEqual([set]);
    expect(await targets(set, setSide)).toEqual([member]);
    expect(await targets(set, memberSide)).toEqual([]);
    expect(await targets(member, setSide)).toEqual([]);
  });

  test("symmetric neighbor is order-agnostic", async () => {
    const north = "00000000000000000000000003";
    const south = "ZZZZZZZZZZZZZZZZZZZZZZZZZX";
    await seedTestNode(fixture, { id: north, properties: { title: "North" } });
    await seedTestNode(fixture, { id: south, properties: { title: "South" } });

    const [assocId] = await seedTestCompositeRelationships(fixture, [
      { a: north, b: south, typeFromA: "Neighbor", typeFromB: "Neighbor" },
    ]);
    const p0 = projectionTypeForEndpoint(assocId!, 0);
    const p1 = projectionTypeForEndpoint(assocId!, 1);

    expect(await targets(north, p0)).toEqual([south]);
    expect(await targets(south, p1)).toEqual([north]);
  });
});
