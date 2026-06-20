import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { GraphDatabase } from "../src/graph";

describe("GraphDatabase", () => {
  let tempDir: string;
  let dbPath: string;

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  test("upserts nodes and relationships", () => {
    tempDir = mkdtempSync(join(tmpdir(), "tome-db-test-"));
    dbPath = join(tempDir, "test.sqlite");
    const db = new GraphDatabase(dbPath);
    db.upsertNode("abc123", { title: "Hello" });
    db.upsertNode("def456", { title: "World" });
    db.upsertRelationship("abc123", "def456", "links_to", { ordinal: 0 });
    db.finalize();
    db.close();

    const db2 = new GraphDatabase(dbPath);
    const v = db2.getNode("abc123");
    expect(v?.properties.title).toBe("Hello");
    const e = db2.getRelationship("abc123:links_to:def456");
    expect(e?.targetNodeId).toBe("def456");
    expect(db2.counts()).toEqual({ nodes: 2, relationships: 1 });
    db2.close();
  });

  test("merges node properties on upsert", () => {
    tempDir = mkdtempSync(join(tmpdir(), "tome-db-test-"));
    dbPath = join(tempDir, "merge.sqlite");
    const db = new GraphDatabase(dbPath);
    db.upsertNode("page1", { title: "A" });
    db.upsertNode("page1", { body: "text" });
    const v = db.getNode("page1");
    expect(v?.properties).toEqual({ title: "A", body: "text" });
    db.close();
  });

  test("deleteRelationship removes an edge", () => {
    tempDir = mkdtempSync(join(tmpdir(), "tome-db-test-"));
    dbPath = join(tempDir, "delete.sqlite");
    const db = new GraphDatabase(dbPath);
    db.upsertNode("a", { title: "A" });
    db.upsertNode("b", { title: "B" });
    db.upsertRelationship("a", "b", "related", { ordinal: 0 });
    expect(db.getRelationship("a:related:b")).not.toBeNull();
    expect(db.deleteRelationship("a", "b", "related")).toBe(true);
    expect(db.getRelationship("a:related:b")).toBeNull();
    db.close();
  });

  test("deleteNode removes a vertex and its edges", () => {
    tempDir = mkdtempSync(join(tmpdir(), "tome-db-test-"));
    dbPath = join(tempDir, "delete-vertex.sqlite");
    const db = new GraphDatabase(dbPath);
    db.upsertNode("a", { title: "A" });
    db.upsertNode("b", { title: "B" });
    db.upsertRelationship("a", "b", "related", { ordinal: 0 });
    expect(db.deleteNode("a")).toBe(true);
    expect(db.getNode("a")).toBeNull();
    db.close();
  });
});
