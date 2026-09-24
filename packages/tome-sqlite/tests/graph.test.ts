import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import {
  configureProfiling,
  getProfilingStore,
  openProfilingStore,
  resetProfilingForTests,
  runInProfilingTrace,
} from "tome-service-interfaces";
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

  test("searchNodesByTitle filters allowedNodeIds in SQL", () => {
    tempDir = mkdtempSync(join(tmpdir(), "tome-sqlite-test-"));
    dbPath = join(tempDir, "search-node-ids.sqlite");
    const db = new GraphDatabase(dbPath);
    db.upsertNode("a", { title: "Alpha" });
    db.upsertNode("b", { title: "Alphabet" });
    expect(
      db.searchNodesByTitle("%Alph%", 10, undefined, new Set(["b"])).map((r) => r.id),
    ).toEqual(["b"]);
    expect(db.searchNodesByTitle("%Alph%", 10, undefined, new Set())).toEqual([]);
    db.close();
  });

  test("searchNodesByTitle filters allowedTypeIds via EXISTS", () => {
    tempDir = mkdtempSync(join(tmpdir(), "tome-sqlite-test-"));
    dbPath = join(tempDir, "search-types.sqlite");
    const perspective = "000000000000000000000000A1:1";
    const typeId = "type-table";
    const memberId = "member-a";
    const outsiderId = "outsider-b";
    const db = new GraphDatabase(dbPath, {
      memberPerspectives: () => [perspective],
    });
    db.upsertNode(typeId, { title: "Type" });
    db.upsertNode(memberId, { title: "Alpha Member" });
    db.upsertNode(outsiderId, { title: "Alpha Outsider" });
    db.upsertRelationship(memberId, typeId, perspective);
    expect(
      db.searchNodesByTitle("%Alpha%", 10, [typeId]).map((r) => r.id),
    ).toEqual([memberId]);
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

  test("lists outgoing projection types and windows with ORDER BY LIMIT OFFSET", () => {
    tempDir = mkdtempSync(join(tmpdir(), "tome-sqlite-test-"));
    dbPath = join(tempDir, "window.sqlite");
    const db = new GraphDatabase(dbPath);
    const source = "01SOURCE000000000000000000";
    const typeA = "assocA:0";
    const typeB = "assocB:0";

    db.upsertNode(source, { title: "Source" });
    for (let i = 0; i < 5; i++) {
      const id = `01TARGET${String(i).padStart(18, "0")}`;
      db.upsertNode(id, { title: `Target ${i}` });
      db.upsertRelationship(source, id, typeA, { ordinal: 4 - i });
    }
    db.upsertNode("01OTHER00000000000000000", { title: "Other" });
    db.upsertRelationship(source, "01OTHER00000000000000000", typeB, { ordinal: 0 });

    expect(db.listOutgoingProjectionTypes(source)).toEqual([typeA, typeB]);

    const page0 = db.listRelationshipsFromSourceWindow(source, typeA, {
      limit: 2,
      offset: 0,
    });
    expect(page0.total).toBe(5);
    expect(page0.relationships).toHaveLength(2);
    // Default ordinal ascending: ordinal 0 then 1 → Target 4, Target 3
    expect(page0.relationships.map((r) => r.targetNodeId)).toEqual([
      "01TARGET000000000000000004",
      "01TARGET000000000000000003",
    ]);

    const page1 = db.listRelationshipsFromSourceWindow(source, typeA, {
      limit: 2,
      offset: 2,
    });
    expect(page1.total).toBe(5);
    expect(page1.relationships.map((r) => r.targetNodeId)).toEqual([
      "01TARGET000000000000000002",
      "01TARGET000000000000000001",
    ]);

    const byName = db.listRelationshipsFromSourceWindow(source, typeA, {
      sorts: [{ column: "name", direction: "asc" }],
      limit: 2,
      offset: 0,
    });
    expect(byName.relationships.map((r) => r.targetNodeId)).toEqual([
      "01TARGET000000000000000000",
      "01TARGET000000000000000001",
    ]);

    db.close();
  });

  test("listRelationshipsFromSourceWindow ties equal ordinals by projection id", () => {
    tempDir = mkdtempSync(join(tmpdir(), "tome-sqlite-tie-"));
    dbPath = join(tempDir, "tie.sqlite");
    const db = new GraphDatabase(dbPath);
    const source = "01SOURCE000000000000000000";
    const typeA = "assocA:0";
    const earlyId = "01TARGET00000000000000000A";
    const lateId = "01TARGET00000000000000000Z";

    db.upsertNode(source, { title: "Source" });
    db.upsertNode(lateId, { title: "Zebra first alphabetically" });
    db.upsertNode(earlyId, { title: "Alpha later alphabetically" });
    // Same ordinal; default order must use projection id, not title.
    db.upsertRelationship(source, lateId, typeA, { ordinal: 0 });
    db.upsertRelationship(source, earlyId, typeA, { ordinal: 0 });

    const page = db.listRelationshipsFromSourceWindow(source, typeA, {
      limit: 2,
      offset: 0,
    });
    expect(page.relationships.map((r) => r.targetNodeId)).toEqual([earlyId, lateId]);

    db.close();
  });

  test("listRelationshipsFromSourceWindow emits CLIENT sql spans when profiling", () => {
    tempDir = mkdtempSync(join(tmpdir(), "tome-sqlite-profiling-"));
    dbPath = join(tempDir, "test.sqlite");
    configureProfiling({
      enabled: true,
      verbose: true,
      slowMs: 0,
      logToStderr: false,
      maxMb: 32,
      batchDeleteMb: 4,
      maxRows: 1000,
      batchDeleteRows: 100,
    });
    openProfilingStore(join(tempDir, "tome-profiling.sqlite"));

    const db = new GraphDatabase(dbPath);
    const source = "01SOURCE000000000000000000";
    const typeA = "assocA:0";
    db.upsertNode(source, { title: "Source" });
    for (let i = 0; i < 3; i++) {
      const id = `01TARGET${String(i).padStart(18, "0")}`;
      db.upsertNode(id, { title: `Target ${i}` });
      db.upsertRelationship(source, id, typeA, { ordinal: i });
    }

    getProfilingStore()?.clear();
    runInProfilingTrace(() => {
      db.listRelationshipsFromSourceWindow(source, typeA, { limit: 2, offset: 0 });
    });

    const clientSpans = getProfilingStore()!.queryAll<{ kind: string; name: string }>(
      `SELECT kind, name FROM spans WHERE kind = 'CLIENT'`,
    );
    expect(clientSpans.length).toBeGreaterThan(0);
    const internal = getProfilingStore()!.queryAll<{ name: string }>(
      `SELECT name FROM spans WHERE kind = 'INTERNAL'`,
    );
    expect(internal.some((r) => r.name === "relationWindow.page")).toBe(true);

    db.close();
    resetProfilingForTests();
  });

  test("windows set membership with ORDER BY LIMIT OFFSET and relation counts", () => {
    tempDir = mkdtempSync(join(tmpdir(), "tome-sqlite-test-"));
    dbPath = join(tempDir, "set-member-window.sqlite");
    const db = new GraphDatabase(dbPath);
    const setId = "01SET0000000000000000000000";
    const setProjection = "assocSet:0";
    const memberProjection = "assocSet:1";
    const linkType = "assocLink:0";

    db.upsertNode(setId, { title: "Type table" });
    for (let i = 0; i < 5; i++) {
      const id = `01MEMBER${String(i).padStart(18, "0")}`;
      db.upsertNode(id, { title: `Member ${i}` });
      db.upsertRelationship(setId, id, setProjection, { ordinal: i });
      for (let j = 0; j < i; j++) {
        const other = `01OTHER${i}${j}000000000000000`;
        db.upsertNode(other, { title: `Other ${i}-${j}` });
        db.upsertRelationship(id, other, linkType, {});
      }
    }

    const page0 = db.listMemberPage(setId, {
      projections: [{ setProjection, memberProjection }],
      sorts: [{ column: "name", direction: "asc" }],
      limit: 2,
      offset: 0,
    });
    expect(page0.total).toBe(5);
    expect(page0.relationships).toHaveLength(2);
    expect(page0.relationships.map((r) => r.sourceNodeId)).toEqual([
      "01MEMBER000000000000000000",
      "01MEMBER000000000000000001",
    ]);
    expect(page0.relationships.every((r) => r.targetNodeId === setId)).toBe(true);

    const page1 = db.listMemberPage(setId, {
      projections: [{ setProjection, memberProjection }],
      sorts: [{ column: "name", direction: "asc" }],
      limit: 2,
      offset: 2,
    });
    expect(page1.relationships.map((r) => r.sourceNodeId)).toEqual([
      "01MEMBER000000000000000002",
      "01MEMBER000000000000000003",
    ]);

    const byRelCount = db.listMemberPage(setId, {
      projections: [{ setProjection, memberProjection }],
      sorts: [{ column: "links", direction: "desc" }],
      relationCounts: [{ column: "links", projectionTypes: [linkType] }],
      limit: 2,
      offset: 0,
    });
    expect(byRelCount.relationships.map((r) => r.sourceNodeId)).toEqual([
      "01MEMBER000000000000000004",
      "01MEMBER000000000000000003",
    ]);

    // Member-side edges only (no set-side) still appear, normalized.
    const memberOnly = "01MEMBERONLY00000000000000";
    db.upsertNode(memberOnly, { title: "AAA member-side" });
    db.upsertRelationship(memberOnly, setId, memberProjection, {});
    const withMemberSide = db.listMemberPage(setId, {
      projections: [{ setProjection, memberProjection }],
      sorts: [{ column: "name", direction: "asc" }],
      limit: 1,
      offset: 0,
    });
    expect(withMemberSide.total).toBe(6);
    expect(withMemberSide.relationships[0]?.sourceNodeId).toBe(memberOnly);

    const digest = "aabbccddeeff00112233445566778899";
    db.replaceExpressionIndexValues(digest, "{}", [
      { memberId: "01MEMBER000000000000000000", sortValue: 10 },
      { memberId: "01MEMBER000000000000000001", sortValue: 50 },
      { memberId: memberOnly, sortValue: 1 },
    ]);
    expect(db.getExpressionIndexStatus(digest)).toBe("ready");
    const byExpr = db.listMemberPage(setId, {
      projections: [{ setProjection, memberProjection }],
      sorts: [{ column: "dyn_metric", direction: "desc" }],
      expressionIndexSorts: [{ column: "dyn_metric", digest }],
      limit: 2,
      offset: 0,
    });
    expect(byExpr.relationships.map((r) => r.sourceNodeId)).toEqual([
      "01MEMBER000000000000000001",
      "01MEMBER000000000000000000",
    ]);

    db.upsertRelationship(setId, "01MEMBER000000000000000002", setProjection, {});
    expect(db.getExpressionIndexStatus(digest)).toBe("stale");

    db.close();
  });

  test("marks only digests whose reachTypes intersect the mutated type", () => {
    tempDir = mkdtempSync(join(tmpdir(), "tome-sqlite-test-"));
    dbPath = join(tempDir, "expr-narrow-stale.sqlite");
    const db = new GraphDatabase(dbPath);

    const digestA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const digestB = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    db.replaceExpressionIndexValues(
      digestA,
      JSON.stringify({ reachTypes: ["typeA", "assocSet:0"] }),
      [{ memberId: "m1", sortValue: 1 }],
    );
    db.replaceExpressionIndexValues(
      digestB,
      JSON.stringify({ reachTypes: ["typeB"] }),
      [{ memberId: "m1", sortValue: 2 }],
    );
    expect(db.getExpressionIndexStatus(digestA)).toBe("ready");
    expect(db.getExpressionIndexStatus(digestB)).toBe("ready");

    db.markExpressionIndexesStaleForTypes(["typeA"], ["m1", "other"]);
    expect(db.getExpressionIndexStatus(digestA)).toBe("stale");
    expect(db.getExpressionIndexStatus(digestB)).toBe("ready");
    expect(db.getExpressionIndexDirtyMemberIds(digestA)?.sort()).toEqual(["m1", "other"]);
    expect(db.getExpressionIndexDirtyMemberIds(digestB)).toBeNull();

    db.close();
  });

  test("upserts expression index values without wiping siblings", () => {
    tempDir = mkdtempSync(join(tmpdir(), "tome-sqlite-test-"));
    dbPath = join(tempDir, "expr-upsert.sqlite");
    const db = new GraphDatabase(dbPath);
    const digest = "cccccccccccccccccccccccccccccccc";
    db.replaceExpressionIndexValues(digest, JSON.stringify({ reachTypes: ["t"] }), [
      { memberId: "m1", sortValue: 10 },
      { memberId: "m2", sortValue: 50 },
    ]);
    db.markExpressionIndexesStaleForTypes(["t"], ["m1"]);
    expect(db.getExpressionIndexStatus(digest)).toBe("stale");

    db.upsertExpressionIndexValues(digest, JSON.stringify({ reachTypes: ["t"] }), [
      { memberId: "m1", sortValue: 99 },
    ]);
    expect(db.getExpressionIndexStatus(digest)).toBe("ready");
    expect(db.getExpressionIndexDirtyMemberIds(digest)).toBeNull();
    const rows = db.queryAll<{ member_id: string; sort_value: number }>(
      "SELECT member_id, sort_value FROM expression_index_values WHERE digest = ? ORDER BY member_id",
      digest,
    );
    expect(rows).toEqual([
      { member_id: "m1", sort_value: 99 },
      { member_id: "m2", sort_value: 50 },
    ]);

    db.deleteExpressionIndexValues(digest, ["m2"]);
    const afterDelete = db.queryAll<{ member_id: string }>(
      "SELECT member_id FROM expression_index_values WHERE digest = ?",
      digest,
    );
    expect(afterDelete).toEqual([{ member_id: "m1" }]);

    db.close();
  });

  test("global markExpressionIndexesStale clears dirty_member_ids", () => {
    tempDir = mkdtempSync(join(tmpdir(), "tome-sqlite-test-"));
    dbPath = join(tempDir, "expr-global-stale.sqlite");
    const db = new GraphDatabase(dbPath);
    const digest = "dddddddddddddddddddddddddddddddd";
    db.replaceExpressionIndexValues(digest, JSON.stringify({ reachTypes: ["t"] }), [
      { memberId: "m1", sortValue: 1 },
    ]);
    db.markExpressionIndexesStaleForTypes(["t"], ["m1"]);
    expect(db.getExpressionIndexDirtyMemberIds(digest)).toEqual(["m1"]);
    // Re-ready then global stale
    db.upsertExpressionIndexValues(digest, JSON.stringify({ reachTypes: ["t"] }), [
      { memberId: "m1", sortValue: 2 },
    ]);
    db.markExpressionIndexesStale();
    expect(db.getExpressionIndexStatus(digest)).toBe("stale");
    expect(db.getExpressionIndexDirtyMemberIds(digest)).toBeNull();

    db.close();
  });

  test("selects relation field link arrays in set membership window SQL", () => {
    tempDir = mkdtempSync(join(tmpdir(), "tome-sqlite-test-"));
    dbPath = join(tempDir, "set-member-relation-fields.sqlite");
    const db = new GraphDatabase(dbPath);
    const setId = "01SET0000000000000000000000";
    const setProjection = "assocSet:0";
    const memberProjection = "assocSet:1";
    const linkType = "assocLink:0";
    const memberA = "01MEMBERA00000000000000000";
    const memberB = "01MEMBERB00000000000000000";
    const target1 = "01TARGET100000000000000000";
    const target2 = "01TARGET200000000000000000";

    db.upsertNode(setId, { title: "Type table" });
    db.upsertNode(memberA, { title: "Member A" });
    db.upsertNode(memberB, { title: "Member B" });
    db.upsertNode(target1, { title: "Alpha" });
    db.upsertNode(target2, { title: "Beta" });
    db.upsertRelationship(setId, memberA, setProjection, { order: 10 });
    db.upsertRelationship(setId, memberB, setProjection, { order: 20 });
    db.upsertRelationship(memberA, target1, linkType, { ordinal: 1 });
    db.upsertRelationship(memberA, target2, linkType, { ordinal: 0 });
    db.upsertRelationship(memberB, target1, linkType, { ordinal: 0 });

    const page = db.listMemberPage(setId, {
      projections: [{ setProjection, memberProjection }],
      intrinsicSequence: true,
      relationFields: [{ column: "links", projectionTypes: [linkType] }],
      limit: 2,
      offset: 0,
    });
    expect(page.relationships.map((r) => r.sourceNodeId)).toEqual([memberA, memberB]);
    expect(page.relationFieldsByRow).toHaveLength(2);
    expect(page.relationFieldsByRow?.[0]?.links).toEqual([
      { targetId: target2, title: "Beta" },
      { targetId: target1, title: "Alpha" },
    ]);
    expect(page.relationFieldsByRow?.[1]?.links).toEqual([
      { targetId: target1, title: "Alpha" },
    ]);

    db.close();
  });

  test("windows composed membership with scope filter, groups, and LIMIT OFFSET", () => {
    tempDir = mkdtempSync(join(tmpdir(), "tome-sqlite-test-"));
    dbPath = join(tempDir, "composed-window.sqlite");
    const db = new GraphDatabase(dbPath);
    const setId = "01SET0000000000000000000000";
    const setProjection = "assocSet:0";
    const memberProjection = "assocSet:1";
    const scopeType = "assocScope:0";
    const groupType = "assocGroup:0";
    const groupSetId = "01GROUPSET0000000000000000";
    const groupSetProjection = "assocGSet:0";
    const groupMemberProjection = "assocGSet:1";
    const groupToScopeType = "assocGScope:0";
    const bookA = "01BOOKA0000000000000000000";
    const bookB = "01BOOKB0000000000000000000";
    const part1 = "01PART10000000000000000000";
    const part2 = "01PART20000000000000000000";

    db.upsertNode(setId, { title: "Scenes" });
    db.upsertNode(groupSetId, { title: "Parts" });
    db.upsertNode(bookA, { title: "Book A" });
    db.upsertNode(bookB, { title: "Book B" });
    db.upsertNode(part1, { title: "Part 1" });
    db.upsertNode(part2, { title: "Part 2" });
    db.upsertRelationship(groupSetId, part1, groupSetProjection, { order: 10 });
    db.upsertRelationship(groupSetId, part2, groupSetProjection, { order: 20 });
    db.upsertRelationship(part1, bookA, groupToScopeType, {});
    db.upsertRelationship(part2, bookA, groupToScopeType, {});

    for (let i = 0; i < 6; i++) {
      const id = `01SCENE${String(i).padStart(19, "0")}`;
      db.upsertNode(id, { title: `Scene ${i}` });
      db.upsertRelationship(setId, id, setProjection, { order: (i + 1) * 10 });
      const book = i < 4 ? bookA : bookB;
      db.upsertRelationship(id, book, scopeType, {});
      if (i < 4) {
        db.upsertRelationship(id, i < 2 ? part1 : part2, groupType, {});
      }
    }

    const scopes = db.listDistinctSetMemberScopeIds(setId, {
      projections: [{ setProjection, memberProjection }],
      scopeProjectionType: scopeType,
    });
    expect(scopes.map((s) => s.id).sort()).toEqual([bookA, bookB].sort());

    const headers = db.listComposedGroupHeaders({
      groupTypeDatabaseId: groupSetId,
      groupSetProjections: [
        { setProjection: groupSetProjection, memberProjection: groupMemberProjection },
      ],
      groupToScopeProjectionType: groupToScopeType,
      scopeNodeId: bookA,
    });
    expect(headers.map((h) => h.id)).toEqual([part1, part2]);

    const page0 = db.listMemberPage(setId, {
      projections: [{ setProjection, memberProjection }],
      scope: { projectionType: scopeType, scopeNodeId: bookA },
      groups: {
        memberToGroupProjectionType: groupType,
        groupTypeDatabaseId: groupSetId,
        groupSetProjections: [
          { setProjection: groupSetProjection, memberProjection: groupMemberProjection },
        ],
        groupToScopeProjectionType: groupToScopeType,
        scopeNodeId: bookA,
        canonicalGroupByTitle: true,
      },
      intrinsicSequence: true,
      relationFields: [
        {
          column: "book",
          projectionTypes: [scopeType],
        },
      ],
      limit: 2,
      offset: 0,
    });
    expect(page0.total).toBe(4);
    expect(page0.relationships).toHaveLength(2);
    expect(page0.groupIds).toEqual([part1, part1]);
    expect(page0.relationFieldsByRow?.[0]?.book).toEqual([
      { targetId: bookA, title: "Book A" },
    ]);
    expect(page0.relationships.map((r) => r.sourceNodeId)).toEqual([
      "01SCENE0000000000000000000",
      "01SCENE0000000000000000001",
    ]);

    const page1 = db.listMemberPage(setId, {
      projections: [{ setProjection, memberProjection }],
      scope: { projectionType: scopeType, scopeNodeId: bookA },
      groups: {
        memberToGroupProjectionType: groupType,
        groupTypeDatabaseId: groupSetId,
        groupSetProjections: [
          { setProjection: groupSetProjection, memberProjection: groupMemberProjection },
        ],
        groupToScopeProjectionType: groupToScopeType,
        scopeNodeId: bookA,
      },
      intrinsicSequence: true,
      limit: 2,
      offset: 2,
    });
    expect(page1.groupIds).toEqual([part2, part2]);
    expect(page1.relationships.map((r) => r.sourceNodeId)).toEqual([
      "01SCENE0000000000000000002",
      "01SCENE0000000000000000003",
    ]);

    db.close();
  });
});
