import { projectionTypeForEndpoint } from "tome-flatfile";
import { afterEach, describe, expect, test } from "bun:test";
import { exportExplorerLodGraph, exportFullGraph } from "../src/graph-export";
import { DEFAULT_EXPLORER_LOD_LAYER_COUNT } from "../src/graph-lod-cluster";
import { archiveNode } from "../src/node-lifecycle";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
  seedTestRelationships,
  TEST_ARCHIVE_NODE_ID,
  TEST_GRAPH_ANCHOR_NODE_ID,
  TEST_INSPIRATIONS_FEATURES_ASSOCIATION_ID,
  TEST_RELATED_ASSOCIATION_ID,
} from "../src/content/test-helpers";
import { openFlatfileQueryableGraphStore } from "../src/graph-store/composed-graph-store";

const PAGE1 = "11111111111111111111111111";
const PAGE2 = "22222222222222222222222222";
const PAGE3 = "33333333333333333333333333";
const ACTIVE = "44444444444444444444444444";
const ARCHIVED = "55555555555555555555555555";
const ANCHOR = "66666666666666666666666666";
const NEAR = "77777777777777777777777777";
const FAR = "88888888888888888888888888";
const NEARBY = "99999999999999999999999999";

describe("graph export", () => {
  const fixtures: ReturnType<typeof createTestContentFixture>[] = [];

  afterEach(() => {
    for (const fixture of fixtures.splice(0)) {
      destroyTestContentFixture(fixture);
    }
  });

  function trackFixture(prefix?: string) {
    const fixture = createTestContentFixture(prefix);
    fixtures.push(fixture);
    return fixture;
  }

  test("exportFullGraph returns active vertices and edges", () => {
    const fixture = trackFixture("tome-graph-export-");
    const { graphStore, store } = fixture.ctx;

    seedTestNode(fixture, { id: PAGE1, properties: { title: "Scene A" } });
    seedTestNode(fixture, { id: PAGE2, properties: { title: "Feature B" } });
    seedTestRelationships(fixture, [
      {
        source: PAGE1,
        target: PAGE2,
        type: projectionTypeForEndpoint(TEST_INSPIRATIONS_FEATURES_ASSOCIATION_ID, 0),
      },
    ]);
    fixture.ctx.sync.fullRebuild();

    const snapshot = exportFullGraph(graphStore, store.contentDir);

    expect(snapshot.nodes).toHaveLength(2);
    expect(snapshot.relationships.length).toBeGreaterThanOrEqual(1);
    expect(snapshot.nodes.find((node) => node.id === PAGE1)?.title).toBe("Scene A");
    expect(snapshot.relationships[0]).toMatchObject({
      source: PAGE1,
      target: PAGE2,
    });
  });

  test("exportFullGraph excludes archived pages and their links", () => {
    const fixture = trackFixture("tome-graph-export-arch-");
    const { graphStore, store } = fixture.ctx;

    seedTestNode(fixture, { id: ACTIVE, properties: { title: "Active scene" } });
    seedTestNode(fixture, { id: ARCHIVED, properties: { title: "Old foil" } });
    seedTestRelationships(fixture, [
      {
        source: ACTIVE,
        target: ARCHIVED,
        type: projectionTypeForEndpoint(TEST_INSPIRATIONS_FEATURES_ASSOCIATION_ID, 1),
      },
    ]);
    fixture.ctx.sync.fullRebuild();
    expect(archiveNode(fixture.ctx, ARCHIVED)).toBeNull();

    expect(fixture.ctx.store.isNodeFileArchived(ARCHIVED)).toBe(true);
    const snapshot = exportFullGraph(graphStore, store.contentDir);
    expect(snapshot.nodes.some((node) => node.id === ARCHIVED)).toBe(false);
    expect(snapshot.nodes.some((node) => node.id === ACTIVE)).toBe(true);
    expect(snapshot.relationships).toHaveLength(0);
  });

  test("exportExplorerLodGraph builds heuristic layers", () => {
    const fixture = trackFixture("tome-graph-export-lod-");
    const { graphStore, store } = fixture.ctx;

    seedTestNode(fixture, { id: PAGE1, properties: { title: "Scene 1" } });
    seedTestNode(fixture, { id: PAGE2, properties: { title: "Scene 2" } });
    seedTestNode(fixture, { id: PAGE3, properties: { title: "Feature 1" } });
    seedTestRelationships(fixture, [
      {
        source: PAGE1,
        target: PAGE2,
        type: TEST_INSPIRATIONS_FEATURES_ASSOCIATION_ID,
      },
      {
        source: PAGE2,
        target: PAGE3,
        type: projectionTypeForEndpoint(TEST_INSPIRATIONS_FEATURES_ASSOCIATION_ID, 0),
      },
    ]);
    fixture.ctx.sync.fullRebuild();

    const lod = exportExplorerLodGraph(graphStore, { contentDir: store.contentDir });

    expect(lod.layerCount).toBe(DEFAULT_EXPLORER_LOD_LAYER_COUNT);
    expect(lod.levels).toHaveLength(DEFAULT_EXPLORER_LOD_LAYER_COUNT);
    expect(lod.levels[0]!.nodes.length).toBeLessThanOrEqual(lod.levels[1]!.nodes.length);
    expect(lod.levels[lod.levels.length - 1]!.nodes.some((node) => node.id === PAGE1)).toBe(true);
  });

  test("exportExplorerLodGraph filters to anchor connected component", () => {
    const fixture = trackFixture("tome-graph-export-anchor-");
    const { graphStore, store } = fixture.ctx;

    seedTestNode(fixture, { id: ANCHOR, properties: { title: "Anchor" } });
    seedTestNode(fixture, { id: NEAR, properties: { title: "Near" } });
    seedTestNode(fixture, { id: FAR, properties: { title: "Far" } });
    seedTestRelationships(fixture, [
      {
        source: ANCHOR,
        target: NEAR,
        type: TEST_RELATED_ASSOCIATION_ID,
      },
    ]);
    fixture.ctx.sync.fullRebuild();

    const lod = exportExplorerLodGraph(graphStore, {
      anchorId: ANCHOR,
      contentDir: store.contentDir,
    });

    const finest = lod.levels[lod.levels.length - 1]!;
    expect(finest.nodes.some((node) => node.id === ANCHOR)).toBe(true);
    expect(finest.nodes.some((node) => node.id === NEAR)).toBe(true);
    expect(finest.nodes.some((node) => node.id === FAR)).toBe(false);
  });

  test("exportExplorerLodGraph without SQLite cache", () => {
    const fixture = trackFixture("tome-graph-export-flatfile-");
    seedTestNode(fixture, { id: TEST_GRAPH_ANCHOR_NODE_ID, properties: { title: "Anchor" } });
    seedTestNode(fixture, { id: NEARBY, properties: { title: "Near" } });
    seedTestRelationships(fixture, [
      {
        source: TEST_GRAPH_ANCHOR_NODE_ID,
        target: NEARBY,
        type: TEST_INSPIRATIONS_FEATURES_ASSOCIATION_ID,
      },
    ]);
    fixture.ctx.cache.close();

    const store = openFlatfileQueryableGraphStore({
      contentPath: fixture.ctx.store.contentDir,
    });
    const lod = exportExplorerLodGraph(store, { anchorId: TEST_GRAPH_ANCHOR_NODE_ID });
    expect(lod.levels[lod.levels.length - 1]!.nodes.some((n) => n.id === NEARBY)).toBe(true);
    store.close();
  });
});
