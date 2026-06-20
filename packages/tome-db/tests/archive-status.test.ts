import { describe, expect, test } from "bun:test";
import { isArchivedNode, isLegacyArchivedNotionPath } from "../src/archive-status";
import { GraphDatabase } from "../src/graph";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TEST_ARCHIVE_NODE_ID } from "../src/content/test-helpers";

describe("archive-status", () => {
  test("isLegacyArchivedNotionPath matches archive root and nested pages", () => {
    expect(isLegacyArchivedNotionPath("Marloth/Archive")).toBe(true);
    expect(isLegacyArchivedNotionPath("Marloth/Archive/Foils/old")).toBe(true);
    expect(isLegacyArchivedNotionPath("Marloth/Scenes/active")).toBe(false);
    expect(isLegacyArchivedNotionPath(null)).toBe(false);
  });

  test("isArchivedNode uses includes edge to Archive hub", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "tome-archive-status-"));
    const dbPath = join(tempDir, "test.sqlite");
    const db = new GraphDatabase(dbPath);

    db.upsertNode("active", { title: "Active" });
    db.upsertNode("archived", { title: "Archived member" });
    db.upsertNode(TEST_ARCHIVE_NODE_ID, { title: "Archive" });
    db.upsertRelationship(TEST_ARCHIVE_NODE_ID, "archived", "includes");
    db.recomputeArchivedFlags(TEST_ARCHIVE_NODE_ID);

    expect(isArchivedNode(db, "archived")).toBe(true);
    expect(isArchivedNode(db, "active")).toBe(false);
    expect(isArchivedNode(db, TEST_ARCHIVE_NODE_ID)).toBe(false);

    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });
});
