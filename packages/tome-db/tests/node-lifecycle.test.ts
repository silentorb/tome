import { describe, expect, test, afterAll } from "bun:test";
import { archiveNode, deleteNode } from "../src/node-lifecycle";
import { isArchivedNode } from "../src/archive-status";
import { getNodeDetail, searchNodes } from "../src/queries";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestIncludes,
  seedTestNode,
  seedTestRelationships,
  TEST_ARCHIVE_NODE_ID,
  TEST_HOME_NODE_ID,
} from "../src/content/test-helpers";
const PAGE_ACTIVE = "AAAAAAAAAAAAAAAAAAAAAAAAAA";
const PAGE_ARCHIVED = "BBBBBBBBBBBBBBBBBBBBBBBBBB";
const PAGE_DELETE = "CCCCCCCCCCCCCCCCCCCCCCCCCC";

describe("record lifecycle", async () => {
  const fixture = await createTestContentFixture("tome-db-lifecycle-");
  const contentDir = fixture.ctx.store.contentDir;

  await seedTestNode(fixture, {
    id: TEST_HOME_NODE_ID,
    properties: { title: "Marloth" },
  });
  await seedTestNode(fixture, {
    id: TEST_ARCHIVE_NODE_ID,
    properties: { title: "Archive" },
  });
  await seedTestNode(fixture, {
    id: PAGE_ACTIVE,
    properties: { title: "Active Scene" },
  });
  await seedTestNode(fixture, {
    id: PAGE_ARCHIVED,
    properties: { title: "Old Scene" },
  });

  await seedTestRelationships(fixture, [
    { source: PAGE_ARCHIVED, target: TEST_ARCHIVE_NODE_ID, type: "member_of" },
  ]);

  test("archiveNode links page to Archive via set membership", async () => {
    expect(await archiveNode(fixture.ctx, PAGE_ACTIVE)).toBeNull();
    const detail = await getNodeDetail(fixture.ctx.cache, PAGE_ACTIVE);
    expect(detail?.archived).toBe(true);
    expect(await isArchivedNode(fixture.ctx.cache, PAGE_ACTIVE, contentDir)).toBe(true);
  });

  test("archiveNode rejects protected and already archived pages", async () => {
    expect(await archiveNode(fixture.ctx, TEST_HOME_NODE_ID)).toBe("protected");
    expect(await archiveNode(fixture.ctx, PAGE_ARCHIVED)).toBe("already_archived");
  });

  test("deleteNode removes vertex and rejects protected pages", async () => {
    await seedTestNode(fixture, {
      id: PAGE_DELETE,
      properties: { title: "Disposable" },
    });
    expect(await deleteNode(fixture.ctx, PAGE_DELETE)).toBeNull();
    expect(await getNodeDetail(fixture.ctx.cache, PAGE_DELETE)).toBeNull();
    expect(await deleteNode(fixture.ctx, TEST_HOME_NODE_ID)).toBe("protected");
  });

  test("searchNodes excludes archived pages", async () => {
    const hits = await searchNodes(fixture.ctx.cache, "Scene", 20);
    expect(hits.some((hit) => hit.id === PAGE_ACTIVE)).toBe(false);
    expect(hits.some((hit) => hit.id === PAGE_ARCHIVED)).toBe(false);
  });

  afterAll(async () => {
    await destroyTestContentFixture(fixture);
  });
});
