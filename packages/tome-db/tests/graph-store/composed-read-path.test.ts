import { afterAll, describe, expect, test } from "bun:test";
import { typeTableMarkerProperties } from "../../src/node-capabilities";
import { getDatabaseViewDetail } from "../../src/database-view";
import { getNodePageMetadata } from "../../src/node-metadata";
import { ComposedGraphStore } from "../../src/graph-store/composed-graph-store";
import {
  listRelationshipsFromSource,
  readStoreListNodesWithBodyLike,
} from "../../src/graph-store/relationship-read";
import { listRelationshipsForComposite } from "../../src/relationship-traverse";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestCompositeRelationships,
  seedTestNode,
  seedTestRelationships,
  seedTestTableSchema,
  seedTestViews,
  TEST_ORDERED_MEMBER_OF_ASSOCIATION_ID,
} from "../../src/content/test-helpers";
import {
  VIEWS_FILE_VERSION,
  projectionTypeForEndpoint,
  type RelationshipsFile,
} from "tome-flatfile";

const SCENES_DB = "0000000000000000000000000D";
const PRODUCTS_DB = "0000000000000000000000000S";
const PARTS_DB = "0000000000000000000000000Z";
const bookA = "AAAAAAAAAAAAAAAAAAAAAAAAAA";
const part1 = "11111111111111111111111111";
const scene1 = "33333333333333333333333333";
const scene2 = "44444444444444444444444444";
const scene3 = "55555555555555555555555555";

function spyRelationshipFileReads(store: ComposedGraphStore): {
  scanCount: () => number;
  restore: () => void;
} {
  const backend = store.flatfileBackend;
  let scans = 0;
  const original = backend.readRelationshipsFile.bind(backend);
  backend.readRelationshipsFile = (): RelationshipsFile => {
    scans += 1;
    return original();
  };
  return {
    scanCount: () => scans,
    restore: () => {
      backend.readRelationshipsFile = original;
    },
  };
}

describe("ComposedGraphStore SQLite read path", () => {
  const fixture = createTestContentFixture("tome-composed-read-");
  const contentDir = fixture.ctx.store.contentDir;
  const graphStore = fixture.ctx.graphStore as ComposedGraphStore;

  seedTestNode(fixture, {
    id: SCENES_DB,
    properties: typeTableMarkerProperties("Scenes"),
  });
  seedTestNode(fixture, {
    id: PRODUCTS_DB,
    properties: typeTableMarkerProperties("Products"),
  });
  seedTestNode(fixture, {
    id: PARTS_DB,
    properties: typeTableMarkerProperties("Parts"),
  });
  seedTestTableSchema(fixture, SCENES_DB, [
    {
      key: "product",
      name: "Product",
      type: "relation",
      association: "000000000000000000000000A3",
    },
    {
      key: "part",
      name: "Part",
      type: "relation",
      association: "000000000000000000000000A4",
    },
  ]);
  seedTestNode(fixture, { id: bookA, properties: { title: "Book A" } });
  seedTestNode(fixture, { id: part1, properties: { title: "Part 1" } });
  seedTestNode(fixture, { id: scene1, properties: { title: "Scene One" } });
  seedTestNode(fixture, { id: scene2, properties: { title: "Scene Two" } });
  seedTestNode(fixture, {
    id: scene3,
    properties: { title: "Scene Three" },
  }, `See [Scene One](./${scene1}.md) for setup.\n`);

  seedTestRelationships(fixture, [
    { source: bookA, target: PRODUCTS_DB, type: "ordered_member_of", properties: { order: "1" } },
    { source: part1, target: PARTS_DB, type: "ordered_member_of", properties: { order: "1" } },
    { source: scene1, target: SCENES_DB, type: "ordered_member_of", properties: { order: "10" } },
    { source: scene2, target: SCENES_DB, type: "ordered_member_of", properties: { order: "20" } },
    { source: scene3, target: SCENES_DB, type: "ordered_member_of", properties: { order: "30" } },
  ]);
  seedTestCompositeRelationships(fixture, [
    {
      a: scene1,
      b: bookA,
      typeFromA: "Scenes",
      typeFromB: "Product",
      associationId: "000000000000000000000000A3",
      properties: { ordinal: 0 },
    },
    {
      a: scene2,
      b: bookA,
      typeFromA: "Scenes",
      typeFromB: "Product",
      associationId: "000000000000000000000000A3",
      properties: { ordinal: 0 },
    },
    {
      a: scene3,
      b: bookA,
      typeFromA: "Scenes",
      typeFromB: "Product",
      associationId: "000000000000000000000000A3",
      properties: { ordinal: 0 },
    },
    {
      a: scene1,
      b: part1,
      typeFromA: "Scenes",
      typeFromB: "Part",
      associationId: "000000000000000000000000A4",
      properties: { ordinal: 0 },
    },
    {
      a: scene2,
      b: part1,
      typeFromA: "Scenes",
      typeFromB: "Part",
      associationId: "000000000000000000000000A4",
      properties: { ordinal: 1 },
    },
  ]);

  const registry = fixture.ctx.store.readAssociationsFile();
  registry.associations["000000000000000000000000A3"] = {
    perspectives: ["Scenes", "Product"],
    endpoints: { 0: { typeId: SCENES_DB }, 1: { typeId: PRODUCTS_DB } },
  };
  registry.associations["000000000000000000000000A4"] = {
    perspectives: ["Scenes", "Part"],
    endpoints: { 0: { typeId: SCENES_DB }, 1: { typeId: PARTS_DB } },
  };
  fixture.ctx.store.writeAssociationsFile(registry);
  fixture.ctx.sync.syncRelationships();

  seedTestViews(fixture, {
    version: VIEWS_FILE_VERSION,
    views: [
      {
        nodeId: SCENES_DB,
        association: TEST_ORDERED_MEMBER_OF_ASSOCIATION_ID,
        generator: "scenes-by-book",
      },
    ],
  });

  afterAll(() => {
    destroyTestContentFixture(fixture);
  });

  test("listRelationshipsFromSource matches cache without scanning flatfile shards", () => {
    const orderedMember = projectionTypeForEndpoint(
      TEST_ORDERED_MEMBER_OF_ASSOCIATION_ID,
      1,
    );

    const spy = spyRelationshipFileReads(graphStore);
    try {
      const viaGraph = listRelationshipsFromSource(graphStore, scene1, orderedMember);
      const viaCache = listRelationshipsFromSource(fixture.ctx.cache, scene1, orderedMember);
      expect(viaGraph.map((r) => r.id).sort()).toEqual(viaCache.map((r) => r.id).sort());
      expect(viaGraph.some((r) => r.targetNodeId === SCENES_DB)).toBe(true);
      expect(spy.scanCount()).toBe(0);
    } finally {
      spy.restore();
    }
  });

  test("listRelationshipsForComposite uses queryAll without flatfile full-scan", () => {
    const spy = spyRelationshipFileReads(graphStore);
    try {
      const viaGraph = listRelationshipsForComposite(
        graphStore,
        scene1,
        "000000000000000000000000A3",
      );
      const viaCache = listRelationshipsForComposite(
        fixture.ctx.cache,
        scene1,
        "000000000000000000000000A3",
      );
      expect(viaGraph.map((r) => r.recordId ?? r.id).sort()).toEqual(
        viaCache.map((r) => r.recordId ?? r.id).sort(),
      );
      expect(viaGraph.some((r) => r.sourceNodeId === bookA || r.targetNodeId === bookA)).toBe(
        true,
      );
      expect(spy.scanCount()).toBe(0);
    } finally {
      spy.restore();
    }
  });

  test("windowed composed database view does not scan flatfile relationship tree", () => {
    const spy = spyRelationshipFileReads(graphStore);
    try {
      const detail = getDatabaseViewDetail(graphStore, SCENES_DB, bookA, contentDir, {
        limit: 2,
        offset: 0,
      });
      expect(detail).toBeTruthy();
      expect(detail?.rowsWindow?.limit).toBe(2);
      expect(detail?.rows.length).toBeLessThanOrEqual(2);
      expect(detail?.rows.length).toBeGreaterThan(0);
      expect(spy.scanCount()).toBe(0);
    } finally {
      spy.restore();
    }
  });

  test("backlink body scan uses cache listNodesWithBodyLike without node-tree walk", () => {
    const spy = spyRelationshipFileReads(graphStore);
    try {
      const matches = readStoreListNodesWithBodyLike(graphStore, `%${scene1}%`);
      const scene3Match = matches.find((m) => m.id === scene3);
      expect(scene3Match).toBeTruthy();
      expect(scene3Match?.body).toContain(`./${scene1}.md`);

      const meta = getNodePageMetadata(graphStore, scene1);
      expect(meta?.backlinks.some((b) => b.sourceId === scene3)).toBe(true);
      expect(meta?.backlinks.find((b) => b.sourceId === scene3)?.title).toBe("Scene Three");
      expect(spy.scanCount()).toBe(0);
    } finally {
      spy.restore();
    }
  });
});
