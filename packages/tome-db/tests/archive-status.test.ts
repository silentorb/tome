import { describe, expect, test } from "bun:test";
import { isArchivedNode, isLegacyArchivedNotionPath } from "../src/archive-status";
import { GraphDatabase } from "../src/graph";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  TEST_ARCHIVE_NODE_ID,
} from "../src/content/test-helpers";

describe("archive-status", () => {
  const fixture = createTestContentFixture("tome-archive-status-fixture-");

  test("isLegacyArchivedNotionPath matches archive root and nested pages", () => {
    const contentDir = fixture.ctx.store.contentDir;
    expect(isLegacyArchivedNotionPath("Marloth/Archive", contentDir)).toBe(true);
    expect(isLegacyArchivedNotionPath("Marloth/Archive/Foils/old", contentDir)).toBe(true);
    expect(isLegacyArchivedNotionPath("Marloth/Scenes/active", contentDir)).toBe(false);
    expect(isLegacyArchivedNotionPath(null, contentDir)).toBe(false);
  });

  test("isArchivedNode uses is_a membership on Archive hub", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "tome-archive-status-"));
    const dbPath = join(tempDir, "test.sqlite");
    const db = new GraphDatabase(dbPath);

    db.upsertNode("active", { title: "Active" });
    db.upsertNode("archived", { title: "Archived member" });
    db.upsertNode(TEST_ARCHIVE_NODE_ID, { title: "Archive" });
    db.upsertRelationship("archived", TEST_ARCHIVE_NODE_ID, "is_a");
    db.recomputeArchivedFlags(TEST_ARCHIVE_NODE_ID);

    expect(isArchivedNode(db, "archived")).toBe(true);
    expect(isArchivedNode(db, "active")).toBe(false);
    expect(isArchivedNode(db, TEST_ARCHIVE_NODE_ID)).toBe(false);

    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("cleanup fixture", () => {
    destroyTestContentFixture(fixture);
  });
});
