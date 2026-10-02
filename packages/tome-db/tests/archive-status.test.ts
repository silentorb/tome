import { projectionTypeForEndpoint } from "tome-flatfile";
import { describe, expect, test } from "bun:test";
import { isArchivedNode, isLegacyArchivedPath } from "../src/archive-status";
import { GraphDatabase, wrapSyncGraphDatabase } from "tome-sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestContentFixture, destroyTestContentFixture, TEST_ARCHIVE_NODE_ID, TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID } from "../src/content/test-helpers";

describe("archive-status", async () => {
  const fixture = await createTestContentFixture("tome-archive-status-fixture-");

  test("isLegacyArchivedPath matches archive root and nested pages", () => {
    const contentDir = fixture.ctx.store.contentDir;
    expect(isLegacyArchivedPath("Marloth/Archive", contentDir)).toBe(true);
    expect(isLegacyArchivedPath("Marloth/Archive/Foils/old", contentDir)).toBe(true);
    expect(isLegacyArchivedPath("Marloth/Scenes/active", contentDir)).toBe(false);
    expect(isLegacyArchivedPath(null, contentDir)).toBe(false);
  });

  test("isArchivedNode uses member_of membership on Archive hub", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "tome-archive-status-"));
    const dbPath = join(tempDir, "test.sqlite");
    const contentDir = fixture.ctx.store.contentDir;
    const db = new GraphDatabase(dbPath, {
      memberPerspectives: () => [projectionTypeForEndpoint(TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID, 1), projectionTypeForEndpoint(TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID, 0)],
    });
  const cache = wrapSyncGraphDatabase(db);

    db.upsertNode("active", { title: "Active" });
    db.upsertNode("archived", { title: "Archived member" });
    db.upsertNode(TEST_ARCHIVE_NODE_ID, { title: "Archive" });
    db.upsertRelationship("archived", TEST_ARCHIVE_NODE_ID, projectionTypeForEndpoint(TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID, 1));
    db.recomputeArchivedFlags(TEST_ARCHIVE_NODE_ID);

    expect(await isArchivedNode(cache, "archived", contentDir)).toBe(true);
    expect(await isArchivedNode(cache, "active", contentDir)).toBe(false);
    expect(await isArchivedNode(cache, TEST_ARCHIVE_NODE_ID, contentDir)).toBe(false);

    await cache.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("cleanup fixture", async () => {
    await destroyTestContentFixture(fixture);
  });
});
