import { describe, expect, test, afterAll } from "bun:test";
import { archiveNode, deleteNode } from "../src/node-lifecycle";
import { isArchivedNode } from "../src/archive-status";
import { getNodeDetail, searchNodes } from "../src/queries";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestIncludes,
  seedTestNode,
  TEST_ARCHIVE_NODE_ID,
  TEST_HOME_NODE_ID,
} from "../src/content/test-helpers";

const PAGE_ACTIVE = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const PAGE_ARCHIVED = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const PAGE_DELETE = "cccccccccccccccccccccccccccccccc";

describe("record lifecycle", () => {
  const fixture = createTestContentFixture("tome-db-lifecycle-");
  const contentDir = fixture.ctx.store.contentDir;

  seedTestNode(fixture, {
    id: TEST_HOME_NODE_ID,
    properties: { title: "Marloth" },
  });
  seedTestNode(fixture, {
    id: TEST_ARCHIVE_NODE_ID,
    properties: { title: "Archive" },
  });
  seedTestNode(fixture, {
    id: PAGE_ACTIVE,
    properties: { title: "Active Scene" },
  });
  seedTestNode(fixture, {
    id: PAGE_ARCHIVED,
    properties: { title: "Old Scene" },
  });

  seedTestIncludes(fixture, [{ a: TEST_ARCHIVE_NODE_ID, b: PAGE_ARCHIVED }]);

  test("archiveNode links page to Archive via includes", () => {
    expect(archiveNode(fixture.ctx, PAGE_ACTIVE)).toBeNull();
    const detail = getNodeDetail(fixture.ctx.db, PAGE_ACTIVE);
    expect(detail?.archived).toBe(true);
    expect(isArchivedNode(fixture.ctx.db, PAGE_ACTIVE, contentDir)).toBe(true);
  });

  test("archiveNode rejects protected and already archived pages", () => {
    expect(archiveNode(fixture.ctx, TEST_HOME_NODE_ID)).toBe("protected");
    expect(archiveNode(fixture.ctx, PAGE_ARCHIVED)).toBe("already_archived");
  });

  test("deleteNode removes vertex and rejects protected pages", () => {
    seedTestNode(fixture, {
      id: PAGE_DELETE,
      properties: { title: "Disposable" },
    });
    expect(deleteNode(fixture.ctx, PAGE_DELETE)).toBeNull();
    expect(getNodeDetail(fixture.ctx.db, PAGE_DELETE)).toBeNull();
    expect(deleteNode(fixture.ctx, TEST_HOME_NODE_ID)).toBe("protected");
  });

  test("searchNodes excludes archived pages", () => {
    const hits = searchNodes(fixture.ctx.db, "Scene", 20);
    expect(hits.some((hit) => hit.id === PAGE_ACTIVE)).toBe(false);
    expect(hits.some((hit) => hit.id === PAGE_ARCHIVED)).toBe(false);
  });

  afterAll(() => {
    destroyTestContentFixture(fixture);
  });
});
