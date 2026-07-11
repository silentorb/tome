import { describe, expect, test, afterAll } from "bun:test";
import { typeTableMarkerProperties } from "../src/node-capabilities";
import {
  applySparseOrderRewrite,
  listOrderedMemberConnections,
  maxOrderAtSet,
  stampOrderIfMissing,
} from "../src/ordered-relationships";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
  seedTestRelationships,
  seedTestTableSchema,
} from "../src/content/test-helpers";

const SCENES_DB = "0000000000000000000000000D";
const scene1 = "AAAAAAAAAAAAAAAAAAAAAAAAAA";
const scene2 = "BBBBBBBBBBBBBBBBBBBBBBBBBB";
const scene3 = "CCCCCCCCCCCCCCCCCCCCCCCCCC";

describe("ordered-relationships", () => {
  const fixture = createTestContentFixture("tome-ordered-rel-");

  seedTestNode(fixture, { id: SCENES_DB, properties: typeTableMarkerProperties("Scenes") });
  seedTestTableSchema(fixture, SCENES_DB, [], "ordered_member_of");
  seedTestNode(fixture, { id: scene1, properties: { title: "One" } });
  seedTestNode(fixture, { id: scene2, properties: { title: "Two" } });
  seedTestNode(fixture, { id: scene3, properties: { title: "Three" } });

  seedTestRelationships(fixture, [
    { source: scene1, target: SCENES_DB, type: "ordered_member_of", properties: { order: "10" } },
    { source: scene2, target: SCENES_DB, type: "ordered_member_of", properties: { order: "30" } },
  ]);

  const { ctx } = fixture;
  const contentDir = ctx.store.contentDir;

  test("listOrderedMemberConnections returns ordered_member_of edges only", () => {
    const connections = listOrderedMemberConnections(ctx.db, SCENES_DB, contentDir);
    expect(connections.map((c) => c.sourceNodeId).sort()).toEqual([scene1, scene2].sort());
  });

  test("maxOrderAtSet reads highest order property", () => {
    expect(maxOrderAtSet(ctx.db, SCENES_DB, contentDir)).toBe(30);
  });

  test("stampOrderIfMissing fills order when absent", () => {
    const stamped = stampOrderIfMissing(ctx, SCENES_DB, scene3, {});
    expect(stamped.order).toBe(31);
  });

  test("applySparseOrderRewrite renumbers to sparse tens", () => {
    const edges = listOrderedMemberConnections(ctx.db, SCENES_DB, contentDir).map((edge) => ({
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: edge.targetNodeId,
      type: edge.type,
      properties: { ...edge.properties },
    }));
    applySparseOrderRewrite(ctx, SCENES_DB, edges, [scene2, scene1]);
    ctx.sync.syncRelationships();

    expect(ctx.db.getRelationship(`${scene1}:${"ordered_member_of"}:${SCENES_DB}`)?.properties.order).toBe(
      "20",
    );
    expect(ctx.db.getRelationship(`${scene2}:${"ordered_member_of"}:${SCENES_DB}`)?.properties.order).toBe(
      "10",
    );
  });

  afterAll(() => destroyTestContentFixture(fixture));
});
