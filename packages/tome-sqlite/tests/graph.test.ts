import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { GraphDatabase } from "../src/graph";
import { SCHEMA_VERSION } from "../src/schema";

const ARCHIVE_SET_PERSPECTIVES = ["000000000000000000000000A9:1"] as const;

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
    tempDir = mkdtempSync(join(tmpdir(), "tome-sqlite-test-"));
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
    tempDir = mkdtempSync(join(tmpdir(), "tome-sqlite-test-"));
    dbPath = join(tempDir, "merge.sqlite");
    const db = new GraphDatabase(dbPath);
    db.upsertNode("page1", { title: "A" });
    db.upsertNode("page1", { body: "text" });
    const v = db.getNode("page1");
    expect(v?.properties).toEqual({ title: "A", body: "text" });
    db.close();
  });

  test("stores promoted columns and EAV leftovers separately", () => {
    tempDir = mkdtempSync(join(tmpdir(), "tome-sqlite-test-"));
    dbPath = join(tempDir, "eav.sqlite");
    const db = new GraphDatabase(dbPath);
    db.upsertNode("n1", {
      title: "Scene",
      alias: "sc",
      body: "hello world",
      created_at: "2020-01-01",
      modified_at: "2020-01-02",
      status: "draft",
      tags: ["a", "b"],
    });
    const node = db.getNode("n1");
    expect(node?.properties).toEqual({
      title: "Scene",
      alias: "sc",
      body: "hello world",
      created_at: "2020-01-01",
      modified_at: "2020-01-02",
      status: "draft",
      tags: ["a", "b"],
    });

    const row = db.queryAll<{ title: string | null; body: string | null }>(
      "SELECT title, body FROM nodes WHERE id = ?",
      "n1",
    )[0];
    expect(row).toEqual({ title: "Scene", body: "hello world" });

    const eav = db.queryAll<{ key: string; value: string }>(
      "SELECT key, value FROM node_properties WHERE node_id = ? ORDER BY key",
      "n1",
    );
    expect(eav).toEqual([
      { key: "status", value: JSON.stringify("draft") },
      { key: "tags", value: JSON.stringify(["a", "b"]) },
    ]);
    db.close();
  });

  test("search and body-like use node columns", () => {
    tempDir = mkdtempSync(join(tmpdir(), "tome-sqlite-test-"));
    dbPath = join(tempDir, "search.sqlite");
    const db = new GraphDatabase(dbPath);
    db.upsertNode("a", { title: "Alpha", body: "link to xyz" });
    db.upsertNode("b", { title: "Beta", body: "other" });

    expect(db.searchNodesByTitle("%Alph%", 10).map((r) => r.id)).toEqual(["a"]);
    expect(db.searchNodesByBody("%xyz%", 10).map((r) => r.id)).toEqual(["a"]);
    expect(db.listNodesWithBodyLike("%xyz%")).toEqual([{ id: "a", body: "link to xyz" }]);
    expect(db.listNodesByTitle(10).map((r) => r.title)).toEqual(["Alpha", "Beta"]);
    db.close();
  });

  test("stores relationship promoted columns and EAV leftovers separately", () => {
    tempDir = mkdtempSync(join(tmpdir(), "tome-sqlite-test-"));
    dbPath = join(tempDir, "rel-eav.sqlite");
    const db = new GraphDatabase(dbPath);
    db.upsertNode("a", { title: "A" });
    db.upsertNode("b", { title: "B" });
    db.upsertRelationship("a", "b", "related", {
      ordinal: 3,
      order: "10",
      priority: 2,
      weight: "strong",
      tags: ["x"],
    });
    const edge = db.getRelationship("a:related:b");
    expect(edge?.properties).toEqual({
      ordinal: 3,
      order: "10",
      priority: 2,
      weight: "strong",
      tags: ["x"],
    });

    const row = db.queryAll<{
      ordinal: number | null;
      order: string | null;
      priority: number | null;
    }>('SELECT ordinal, "order", priority FROM relationship_projections WHERE id = ?', "a:related:b")[0];
    expect(row).toEqual({ ordinal: 3, order: "10", priority: 2 });

    const eav = db.queryAll<{ key: string; value: string }>(
      "SELECT key, value FROM relationship_projection_properties WHERE projection_id = ? ORDER BY key",
      "a:related:b",
    );
    expect(eav).toEqual([
      { key: "tags", value: JSON.stringify(["x"]) },
      { key: "weight", value: JSON.stringify("strong") },
    ]);
    db.close();
  });

  test("migrates v12 relationship JSON bags into columns + EAV", () => {
    tempDir = mkdtempSync(join(tmpdir(), "tome-sqlite-test-"));
    dbPath = join(tempDir, "migrate-v13.sqlite");
    const raw = new Database(dbPath, { create: true });
    raw.exec(`
      CREATE TABLE meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
      CREATE TABLE nodes (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT,
        alias TEXT,
        body TEXT,
        created_at TEXT,
        modified_at TEXT,
        is_archived INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE relationship_records (
        id TEXT PRIMARY KEY NOT NULL,
        node_a TEXT NOT NULL,
        node_b TEXT NOT NULL,
        composite_type TEXT NOT NULL,
        properties TEXT NOT NULL DEFAULT '{}',
        UNIQUE (node_a, node_b, composite_type)
      );
      CREATE TABLE relationship_projections (
        id TEXT PRIMARY KEY NOT NULL,
        record_id TEXT NOT NULL REFERENCES relationship_records(id) ON DELETE CASCADE,
        source_node_id TEXT NOT NULL,
        target_node_id TEXT NOT NULL,
        type TEXT NOT NULL,
        properties TEXT NOT NULL DEFAULT '{}'
      );
      INSERT INTO meta (key, value) VALUES ('schema_version', '12');
      INSERT INTO nodes (id, title, is_archived) VALUES ('a', 'A', 0), ('b', 'B', 0);
      INSERT INTO relationship_records (id, node_a, node_b, composite_type, properties)
        VALUES ('rec1', 'a', 'b', 'related', '{"ordinal":1,"priority":2,"weight":"strong"}');
      INSERT INTO relationship_projections (id, record_id, source_node_id, target_node_id, type, properties)
        VALUES ('a:related:b', 'rec1', 'a', 'b', 'related', '{"ordinal":1,"priority":2,"weight":"strong"}');
    `);
    raw.close();

    const db = new GraphDatabase(dbPath);
    expect(db.getMeta("schema_version")).toBe(String(SCHEMA_VERSION));
    expect(db.getRelationship("a:related:b")?.properties).toEqual({
      ordinal: 1,
      priority: 2,
      weight: "strong",
    });
    const columnNames = db
      .queryAll<{ name: string }>("SELECT name FROM pragma_table_info('relationship_projections')")
      .map((row) => row.name);
    expect(columnNames).not.toContain("properties");
    expect(columnNames).toContain("ordinal");
    expect(columnNames).toContain("priority");
    db.close();
  });

  test("migrates v11 JSON properties bag into columns + EAV", () => {
    tempDir = mkdtempSync(join(tmpdir(), "tome-sqlite-test-"));
    dbPath = join(tempDir, "migrate-v12.sqlite");
    const raw = new Database(dbPath, { create: true });
    raw.exec(`
      CREATE TABLE meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
      CREATE TABLE nodes (
        id TEXT PRIMARY KEY NOT NULL,
        properties TEXT NOT NULL DEFAULT '{}',
        is_archived INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO meta (key, value) VALUES ('schema_version', '11');
      INSERT INTO nodes (id, properties, is_archived) VALUES
        ('n1', '{"title":"Hello","body":"world","status":"live","tags":["x"]}', 0),
        ('n2', '{"alias":"OnlyAlias"}', 0);
    `);
    raw.close();

    const db = new GraphDatabase(dbPath);
    expect(db.getMeta("schema_version")).toBe(String(SCHEMA_VERSION));
    expect(db.getNode("n1")?.properties).toEqual({
      title: "Hello",
      body: "world",
      status: "live",
      tags: ["x"],
    });
    expect(db.getNode("n2")?.properties).toEqual({ alias: "OnlyAlias" });
    const columnNames = db
      .queryAll<{ name: string }>("SELECT name FROM pragma_table_info('nodes')")
      .map((row) => row.name);
    expect(columnNames).not.toContain("properties");
    expect(columnNames).toContain("title");
    expect(columnNames).toContain("body");
    db.close();
  });

  test("deleteRelationship removes an edge", () => {
    tempDir = mkdtempSync(join(tmpdir(), "tome-sqlite-test-"));
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
    tempDir = mkdtempSync(join(tmpdir(), "tome-sqlite-test-"));
    dbPath = join(tempDir, "delete-vertex.sqlite");
    const db = new GraphDatabase(dbPath);
    db.upsertNode("a", { title: "A" });
    db.upsertNode("b", { title: "B" });
    db.upsertRelationship("a", "b", "related", { ordinal: 0 });
    expect(db.deleteNode("a")).toBe(true);
    expect(db.getNode("a")).toBeNull();
    db.close();
  });

  test("listArchiveMemberIds finds members via injected set-trait perspectives", () => {
    tempDir = mkdtempSync(join(tmpdir(), "tome-sqlite-test-"));
    dbPath = join(tempDir, "archive.sqlite");
    const hub = "01ARCHIVEHUB00000000000000";
    const member = "EEEEEEEEEEEEEEEEEEEEEEEEEE";

    const db = new GraphDatabase(dbPath, {
      memberPerspectives: () => ARCHIVE_SET_PERSPECTIVES,
    });
    db.upsertNode(hub, { title: "Archive" });
    db.upsertNode(member, { title: "Archived page" });
    db.upsertRelationship(member, hub, ARCHIVE_SET_PERSPECTIVES[0]);

    const ids = db.listArchiveMemberIds(hub);
    expect(ids).toEqual([member]);

    db.recomputeArchivedFlags(hub);
    expect(db.isNodeArchived(member)).toBe(true);

    db.close();
  });

  test("listArchiveMemberIds accepts explicit perspectives override", () => {
    tempDir = mkdtempSync(join(tmpdir(), "tome-sqlite-test-"));
    dbPath = join(tempDir, "archive-override.sqlite");
    const hub = "01ARCHIVEHUB00000000000000";
    const member = "EEEEEEEEEEEEEEEEEEEEEEEEEE";

    const db = new GraphDatabase(dbPath);
    db.upsertNode(hub, { title: "Archive" });
    db.upsertNode(member, { title: "Archived page" });
    db.upsertRelationship(member, hub, ARCHIVE_SET_PERSPECTIVES[0]);

    const ids = db.listArchiveMemberIds(hub, ARCHIVE_SET_PERSPECTIVES);
    expect(ids).toEqual([member]);
    db.close();
  });
});
