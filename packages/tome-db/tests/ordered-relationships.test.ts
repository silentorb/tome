import { describe, expect, test, afterAll } from "bun:test";
import { typeTableMarkerProperties } from "../src/node-capabilities";
import {
  applySparseSequenceRewrite,
  listOrderedMemberConnections,
  maxOrderAtSet,
  stampOrderIfMissing,
} from "../src/ordered-relationships";
import { createTestContentFixture, destroyTestContentFixture, seedTestNode, seedTestRelationships, seedTestTableSchema, projectionTypeForEndpoint, TEST_ORDERED_MEMBER_OF_RELATIONSHIP_TYPE_ID } from "../src/content/test-helpers";

const SCENES_DB = "0000000000000000000000000D";
const scene1 = "AAAAAAAAAAAAAAAAAAAAAAAAAA";
const scene2 = "BBBBBBBBBBBBBBBBBBBBBBBBBB";
const scene3 = "CCCCCCCCCCCCCCCCCCCCCCCCCC";

describe("ordered-relationships", async () => {
  const fixture = await createTestContentFixture("tome-ordered-rel-");

  await seedTestNode(fixture, { id: SCENES_DB, properties: typeTableMarkerProperties("Scenes") });
  seedTestTableSchema(fixture, SCENES_DB, []);
  await seedTestNode(fixture, { id: scene1, properties: { title: "One" } });
  await seedTestNode(fixture, { id: scene2, properties: { title: "Two" } });
  await seedTestNode(fixture, { id: scene3, properties: { title: "Three" } });

  await seedTestRelationships(fixture, [
    { source: scene1, target: SCENES_DB, type: "ordered_member_of", properties: { order: "10" } },
    { source: scene2, target: SCENES_DB, type: "ordered_member_of", properties: { order: "30" } },
  ]);

  const { ctx } = fixture;
  const contentDir = ctx.store.contentDir;

  test("listOrderedMemberConnections returns ordered_member_of edges only", async () => {
    const connections = await listOrderedMemberConnections(ctx.cache, SCENES_DB, contentDir);
    expect(connections.map((c) => c.sourceNodeId).sort()).toEqual([scene1, scene2].sort());
  });

  test("maxOrderAtSet reads highest order property", async () => {
    expect(await maxOrderAtSet(ctx.cache, SCENES_DB, contentDir)).toBe(30);
  });

  test("stampOrderIfMissing fills order when absent", async () => {
    const stamped = await stampOrderIfMissing(ctx, SCENES_DB, scene3, {});
    expect(stamped.order).toBe(31);
  });

  test("applySparseSequenceRewrite renumbers to sparse tens", async () => {
    await applySparseSequenceRewrite(ctx, SCENES_DB, [scene2, scene1]);
    await ctx.sync.syncRelationships();

    expect((await ctx.cache.getRelationship(`${scene1}:${projectionTypeForEndpoint(TEST_ORDERED_MEMBER_OF_RELATIONSHIP_TYPE_ID, 1)}:${SCENES_DB}`))?.properties.order).toBe(
      "20",
    );
    expect((await ctx.cache.getRelationship(`${scene2}:${projectionTypeForEndpoint(TEST_ORDERED_MEMBER_OF_RELATIONSHIP_TYPE_ID, 1)}:${SCENES_DB}`))?.properties.order).toBe(
      "10",
    );
  });

  afterAll(async () => await destroyTestContentFixture(fixture));
});
