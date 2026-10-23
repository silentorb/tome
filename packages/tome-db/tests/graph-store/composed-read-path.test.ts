import { afterAll, describe, expect, test } from "bun:test";
import { hostsProjectionFilterGraph } from "tome-ontology";
import { typeTableMarkerProperties } from "../../src/node-capabilities";
import { getDatabaseViewDetail } from "../../src/database-view";
import { exportFullGraph } from "../../src/graph-export";
import { getNodePageMetadata } from "../../src/node-metadata";
import { createNodeFilterEvaluator } from "../../src/predicate-membership";
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
  TEST_ORDERED_MEMBER_OF_RELATIONSHIP_TYPE_ID,
  defaultTestPresentationLayers,
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

function spyFlatfileNodeReads(store: ComposedGraphStore): {
  readCount: () => number;
  restore: () => void;
} {
  const backend = store.flatfileBackend;
  let reads = 0;
  const original = backend.readNode.bind(backend);
  backend.readNode = (id: string) => {
    reads += 1;
    return original(id);
  };
  return {
    readCount: () => reads,
    restore: () => {
      backend.readNode = original;
    },
  };
}

function spyFlatfileListAndArchive(store: ComposedGraphStore): {
  listCount: () => number;
  archiveCount: () => number;
  restore: () => void;
} {
  const ff = store.flatfile;
  let listCalls = 0;
  let archiveCalls = 0;
  const originalList = ff.listNodeIds.bind(ff);
  const originalArchived = ff.isNodeArchived.bind(ff);
  ff.listNodeIds = async () => {
    listCalls += 1;
    return originalList();
  };
  ff.isNodeArchived = async (id: string) => {
    archiveCalls += 1;
    return originalArchived(id);
  };
  return {
    listCount: () => listCalls,
    archiveCount: () => archiveCalls,
    restore: () => {
      ff.listNodeIds = originalList;
      ff.isNodeArchived = originalArchived;
    },
  };
}

describe("ComposedGraphStore SQLite read path", async () => {
  const fixture = await createTestContentFixture("tome-composed-read-");
  const contentDir = fixture.ctx.store.contentDir;
  const graphStore = fixture.ctx.graphStore as ComposedGraphStore;

  await seedTestNode(fixture, {
    id: SCENES_DB,
    properties: typeTableMarkerProperties("Scenes"),
  });
  await seedTestNode(fixture, {
    id: PRODUCTS_DB,
    properties: typeTableMarkerProperties("Products"),
  });
  await seedTestNode(fixture, {
    id: PARTS_DB,
    properties: typeTableMarkerProperties("Parts"),
  });
  seedTestTableSchema(fixture, SCENES_DB, [
    {
      key: "product",
      name: "Product",
      type: "relation",
      association: "000000000000000000000000A3",
              endpoint: 0,
    },
    {
      key: "part",
      name: "Part",
      type: "relation",
      association: "000000000000000000000000A4",
              endpoint: 0,
    },
  ]);
  await seedTestNode(fixture, { id: bookA, properties: { title: "Book A" } });
  await seedTestNode(fixture, { id: part1, properties: { title: "Part 1" } });
  await seedTestNode(fixture, { id: scene1, properties: { title: "Scene One" } });
  await seedTestNode(fixture, { id: scene2, properties: { title: "Scene Two" } });
  await seedTestNode(fixture, {
    id: scene3,
    properties: { title: "Scene Three" },
  }, `See [Scene One](./${scene1}.md) for setup.\n`);

  await seedTestRelationships(fixture, [
    { source: bookA, target: PRODUCTS_DB, type: "ordered_member_of", properties: { order: "1" } },
    { source: part1, target: PARTS_DB, type: "ordered_member_of", properties: { order: "1" } },
    { source: scene1, target: SCENES_DB, type: "ordered_member_of", properties: { order: "10" } },
    { source: scene2, target: SCENES_DB, type: "ordered_member_of", properties: { order: "20" } },
    { source: scene3, target: SCENES_DB, type: "ordered_member_of", properties: { order: "30" } },
  ]);
  await seedTestCompositeRelationships(fixture, [
    {
      a: scene1,
      b: bookA,
      typeFromA: "Scenes",
      typeFromB: "Product",
      relationshipTypeId: "000000000000000000000000A3",
      properties: { ordinal: 0 },
    },
    {
      a: scene2,
      b: bookA,
      typeFromA: "Scenes",
      typeFromB: "Product",
      relationshipTypeId: "000000000000000000000000A3",
      properties: { ordinal: 0 },
    },
    {
      a: scene3,
      b: bookA,
      typeFromA: "Scenes",
      typeFromB: "Product",
      relationshipTypeId: "000000000000000000000000A3",
      properties: { ordinal: 0 },
    },
    {
      a: scene1,
      b: part1,
      typeFromA: "Scenes",
      typeFromB: "Part",
      relationshipTypeId: "000000000000000000000000A4",
      properties: { ordinal: 0 },
    },
    {
      a: scene2,
      b: part1,
      typeFromA: "Scenes",
      typeFromB: "Part",
      relationshipTypeId: "000000000000000000000000A4",
      properties: { ordinal: 1 },
    },
  ]);

  const registry = fixture.ctx.store.readRelationshipTypesFile();
  registry.relationshipTypes["000000000000000000000000A3"] = {
    perspectives: ["Scenes", "Product"],
    endpoints: { 0: { typeId: SCENES_DB }, 1: { typeId: PRODUCTS_DB } },
  };
  registry.relationshipTypes["000000000000000000000000A4"] = {
    perspectives: ["Scenes", "Part"],
    endpoints: { 0: { typeId: SCENES_DB }, 1: { typeId: PARTS_DB } },
  };
  fixture.ctx.store.writeRelationshipTypesFile(registry);
  await fixture.ctx.sync.syncRelationships();

  seedTestViews(fixture, {
    version: VIEWS_FILE_VERSION,
    views: [
      {
        nodeId: SCENES_DB,
        association: TEST_ORDERED_MEMBER_OF_RELATIONSHIP_TYPE_ID,
        presentation: defaultTestPresentationLayers(),
      },
    ],
  });

  afterAll(async () => {
    await destroyTestContentFixture(fixture);
  });

  test("listRelationshipsFromSource matches cache without scanning flatfile shards", async () => {
    const orderedMember = projectionTypeForEndpoint(
      TEST_ORDERED_MEMBER_OF_RELATIONSHIP_TYPE_ID,
      1,
    );

    const spy = spyRelationshipFileReads(graphStore);
    try {
      const viaGraph = await listRelationshipsFromSource(graphStore, scene1, orderedMember);
      const viaCache = await listRelationshipsFromSource(fixture.ctx.cache, scene1, orderedMember);
      expect(viaGraph.map((r) => r.id).sort()).toEqual(viaCache.map((r) => r.id).sort());
      expect(viaGraph.some((r) => r.targetNodeId === SCENES_DB)).toBe(true);
      expect(spy.scanCount()).toBe(0);
    } finally {
      spy.restore();
    }
  });

  test("listRelationshipsForComposite uses queryAll without flatfile full-scan", async () => {
    const spy = spyRelationshipFileReads(graphStore);
    try {
      const viaGraph = await listRelationshipsForComposite(
        graphStore,
        scene1,
        "000000000000000000000000A3",
      );
      const viaCache = await listRelationshipsForComposite(
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

  test("windowed composed database view does not scan flatfile relationship tree", async () => {
    const spy = spyRelationshipFileReads(graphStore);
    try {
      const detail = await getDatabaseViewDetail(graphStore, SCENES_DB, bookA, contentDir, {
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

  test("getNode and windowed database view do not read flatfile node markdown", async () => {
    const spy = spyFlatfileNodeReads(graphStore);
    try {
      const node = await graphStore.getNode(scene1);
      expect(node?.properties.title).toBe("Scene One");
      expect(spy.readCount()).toBe(0);

      const detail = await getDatabaseViewDetail(graphStore, SCENES_DB, bookA, contentDir, {
        limit: 2,
        offset: 0,
      });
      expect(detail?.rows.length).toBeGreaterThan(0);
      expect(spy.readCount()).toBe(0);
    } finally {
      spy.restore();
    }
  });

  test("backlink body scan uses cache listNodesWithBodyLike without node-tree walk", async () => {
    const spy = spyRelationshipFileReads(graphStore);
    try {
      const matches = await readStoreListNodesWithBodyLike(graphStore, `%${scene1}%`);
      const scene3Match = matches.find((m) => m.id === scene3);
      expect(scene3Match).toBeTruthy();
      expect(scene3Match?.body).toContain(`./${scene1}.md`);

      const meta = await getNodePageMetadata(graphStore, scene1);
      expect(meta?.backlinks.some((b) => b.sourceId === scene3)).toBe(true);
      expect(meta?.backlinks.find((b) => b.sourceId === scene3)?.title).toBe("Scene Three");
      expect(spy.scanCount()).toBe(0);
    } finally {
      spy.restore();
    }
  });

  test("listNodeIds and isNodeArchived use cache without flatfile inventory", async () => {
    const spy = spyFlatfileListAndArchive(graphStore);
    try {
      const ids = await graphStore.listNodeIds();
      expect(ids).toContain(scene1);
      expect(await graphStore.isNodeArchived(scene1)).toBe(false);
      expect(spy.listCount()).toBe(0);
      expect(spy.archiveCount()).toBe(0);
    } finally {
      spy.restore();
    }
  });

  test("exportFullGraph uses cache inventory without flatfile list/archive probes", async () => {
    const listSpy = spyFlatfileListAndArchive(graphStore);
    const relSpy = spyRelationshipFileReads(graphStore);
    try {
      const snapshot = await exportFullGraph(graphStore, contentDir);
      expect(snapshot.nodes.some((n) => n.id === scene1)).toBe(true);
      expect(listSpy.listCount()).toBe(0);
      expect(listSpy.archiveCount()).toBe(0);
      expect(relSpy.scanCount()).toBe(0);
    } finally {
      listSpy.restore();
      relSpy.restore();
    }
  });

  test("empty hosts_projection on composed store does not scan flatfile shards", async () => {
    const spy = spyRelationshipFileReads(graphStore);
    try {
      const evaluate = createNodeFilterEvaluator(graphStore, contentDir);
      // Relationship type with no projections in this fixture — empty is authoritative.
      const graph = hostsProjectionFilterGraph("000000000000000000000000ZZ", 0);
      expect(await evaluate(graph, scene1)).toBe(false);
      expect(spy.scanCount()).toBe(0);
    } finally {
      spy.restore();
    }
  });

  test("get/findRelationshipRecord use cache without scanning flatfile shards", async () => {
    const composite = "000000000000000000000000A3";
    const projection = projectionTypeForEndpoint(composite, 0);
    const spy = spyRelationshipFileReads(graphStore);
    try {
      const record = await graphStore.getRelationshipRecord(scene1, bookA, composite);
      expect(record).toBeTruthy();
      expect([record!.a, record!.b].sort()).toEqual([scene1, bookA].sort());
      expect(record!.type).toBe(composite);

      const byComposite = await graphStore.findRelationshipRecord(scene1, bookA, composite);
      expect(byComposite?.sourceNodeId).toBe(scene1);
      expect(byComposite?.targetNodeId).toBe(bookA);
      expect(byComposite?.type).toBe(projection);

      const byProjection = await graphStore.findRelationshipRecord(scene1, bookA, projection);
      expect(byProjection?.id).toBe(byComposite?.id);

      expect(await graphStore.findRelationshipRecord(scene1, bookA, "000000000000000000000000ZZ")).toBeNull();
      expect(spy.scanCount()).toBe(0);
    } finally {
      spy.restore();
    }
  });
});
