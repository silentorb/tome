import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { exportExplorerLodGraph, exportFullGraph } from "../src/graph-export";
import { DEFAULT_EXPLORER_LOD_LAYER_COUNT } from "../src/graph-lod-cluster";
import { GraphDatabase } from "../src/graph";
import { TEST_ARCHIVE_NODE_ID } from "../src/content/test-helpers";

describe("graph export", () => {
  let tempDir: string;
  let dbPath: string;

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  test("exportFullGraph returns active vertices and edges", () => {
    tempDir = mkdtempSync(join(tmpdir(), "tome-graph-export-"));
    dbPath = join(tempDir, "test.sqlite");
    const db = new GraphDatabase(dbPath);

    db.upsertNode("page1", { title: "Scene A" });
    db.upsertNode("page2", { title: "Feature B" });
    db.upsertRelationship("page1", "page2", "features");

    const snapshot = exportFullGraph(db);
    db.close();

    expect(snapshot.nodes).toHaveLength(2);
    expect(snapshot.relationships).toHaveLength(1);
    expect(snapshot.nodes.find((node) => node.id === "page1")?.title).toBe("Scene A");
    expect(snapshot.relationships[0]).toMatchObject({
      source: "page1",
      target: "page2",
      type: "features",
    });
  });

  test("exportFullGraph excludes archived pages and their links", () => {
    tempDir = mkdtempSync(join(tmpdir(), "tome-graph-export-"));
    dbPath = join(tempDir, "archive.sqlite");
    const db = new GraphDatabase(dbPath);

    db.upsertNode("active", { title: "Active scene" });
    db.upsertNode("archived", { title: "Old foil" });
    db.upsertNode(TEST_ARCHIVE_NODE_ID, { title: "Archive" });
    db.upsertRelationship("active", "archived", "inspirations");
    db.upsertRelationship(TEST_ARCHIVE_NODE_ID, "archived", "includes");
    db.recomputeArchivedFlags(TEST_ARCHIVE_NODE_ID);

    const snapshot = exportFullGraph(db);
    db.close();

    expect(snapshot.nodes).toHaveLength(1);
    expect(snapshot.nodes[0]?.id).toBe("active");
    expect(snapshot.relationships).toHaveLength(0);
  });

  test("exportExplorerLodGraph builds heuristic layers", () => {
    tempDir = mkdtempSync(join(tmpdir(), "tome-graph-export-"));
    dbPath = join(tempDir, "lod.sqlite");
    const db = new GraphDatabase(dbPath);

    db.upsertNode("page1", { title: "Scene 1" });
    db.upsertNode("page2", { title: "Scene 2" });
    db.upsertNode("page3", { title: "Feature 1" });
    db.upsertRelationship("page1", "page2", "blocks");
    db.upsertRelationship("page2", "page3", "features");

    const lod = exportExplorerLodGraph(db);
    db.close();

    expect(lod.layerCount).toBe(DEFAULT_EXPLORER_LOD_LAYER_COUNT);
    expect(lod.levels).toHaveLength(DEFAULT_EXPLORER_LOD_LAYER_COUNT);
    expect(lod.levels[0]!.nodes.length).toBeLessThanOrEqual(lod.levels[1]!.nodes.length);
    expect(lod.levels[lod.levels.length - 1]!.nodes.some((node) => node.id === "page1")).toBe(true);
  });

  test("exportExplorerLodGraph filters to anchor connected component", () => {
    tempDir = mkdtempSync(join(tmpdir(), "tome-graph-export-"));
    dbPath = join(tempDir, "anchor.sqlite");
    const db = new GraphDatabase(dbPath);

    db.upsertNode("anchor", { title: "Anchor" });
    db.upsertNode("near", { title: "Near" });
    db.upsertNode("far", { title: "Far" });
    db.upsertRelationship("anchor", "near", "relates");

    const lod = exportExplorerLodGraph(db, { anchorId: "anchor" });
    db.close();

    const finest = lod.levels[lod.levels.length - 1]!;
    expect(finest.nodes.some((node) => node.id === "anchor")).toBe(true);
    expect(finest.nodes.some((node) => node.id === "near")).toBe(true);
    expect(finest.nodes.some((node) => node.id === "far")).toBe(false);
  });
});
