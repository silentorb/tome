import { describe, expect, test, afterAll } from "bun:test";
import { archiveNode, unarchiveNode } from "../src/node-lifecycle";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestIncludes,
  seedTestNode,
  TEST_ARCHIVE_NODE_ID,
  TEST_HOME_NODE_ID,
  TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID,
  projectionTypeForEndpoint,
} from "../src/content/test-helpers";

const HUB = TEST_ARCHIVE_NODE_ID;
const HOME = TEST_HOME_NODE_ID;
const NODE_A = "AAAAAAAAAAAAAAAAAAAAAAAAAA";
const NODE_B = "BBBBBBBBBBBBBBBBBBBBBBBBBB";

describe("shared archived edge unarchive", async () => {
  const fixture = await createTestContentFixture("tome-lifecycle-shared-");

  await seedTestNode(fixture, { id: HOME, properties: { title: "Home" } });
  await seedTestNode(fixture, { id: HUB, properties: { title: "Archive" } });
  await seedTestNode(fixture, { id: NODE_A, properties: { title: "A" } });
  await seedTestNode(fixture, { id: NODE_B, properties: { title: "B" } });

  await seedTestIncludes(fixture, [{ a: NODE_A, b: NODE_B, compositeType: "000000000000000000000000BF" }]);

  test("unarchiving one endpoint keeps shared edge archived while other remains archived", async () => {
    expect(await archiveNode(fixture.ctx, NODE_A)).toBeNull();
    expect(await archiveNode(fixture.ctx, NODE_B)).toBeNull();

    expect(await unarchiveNode(fixture.ctx, NODE_A)).toBeNull();

    const shared = fixture.ctx.store
      .readArchivedRelationships()
      .find((e) => e.type === "000000000000000000000000BF" && e.a !== HUB && e.b !== HUB);
    expect(shared).toBeDefined();
    expect(fixture.ctx.store.isRelationshipArchived(shared!.a, shared!.b, shared!.type)).toBe(true);
    expect(await fixture.ctx.cache.listRelationshipsFromSource(NODE_A)).toHaveLength(0);
    const nodeBOutgoing = await fixture.ctx.cache.listRelationshipsFromSource(NODE_B);
    expect(nodeBOutgoing).toHaveLength(1);
    expect(nodeBOutgoing[0]?.type).toBe(projectionTypeForEndpoint(TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID, 1));
  });

  afterAll(async () => {
    await destroyTestContentFixture(fixture);
  });
});
