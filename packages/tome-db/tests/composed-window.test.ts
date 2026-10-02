import { describe, expect, test, afterAll } from "bun:test";
import { typeTableMarkerProperties } from "../src/node-capabilities";
import { getDatabaseViewDetail } from "../src/database-view";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestCompositeRelationships,
  seedTestRelationships,
  seedTestNode,
  seedTestViews,
  seedTestDynamicProperties,
  seedTestTableSchema,
  TEST_ORDERED_MEMBER_OF_RELATIONSHIP_TYPE_ID,
  defaultTestPresentationLayers,
} from "../src/content/test-helpers";
import { VIEWS_FILE_VERSION } from "tome-flatfile";

const SCENES_DB = "0000000000000000000000000D";
const PARTS_DB = "0000000000000000000000000Z";
const PRODUCTS_DB = "0000000000000000000000000S";
const bookA = "AAAAAAAAAAAAAAAAAAAAAAAAAA";
const bookB = "BBBBBBBBBBBBBBBBBBBBBBBBBB";
const part1 = "11111111111111111111111111";
const part2 = "22222222222222222222222222";

describe("composed table SQL windows", async () => {
  const fixture = await createTestContentFixture("tome-composed-window-");

  await seedTestNode(fixture, { id: PRODUCTS_DB, properties: typeTableMarkerProperties("Products") });
  await seedTestNode(fixture, { id: PARTS_DB, properties: typeTableMarkerProperties("Parts database") });
  seedTestTableSchema(fixture, PRODUCTS_DB, []);
  seedTestTableSchema(fixture, PARTS_DB, [
    {
      key: "products",
      name: "Products",
      type: "relation",
      association: "000000000000000000000000A5",
      endpoint: 0,
    },
  ]);
  await seedTestNode(fixture, {
    id: SCENES_DB,
    properties: typeTableMarkerProperties("Scenes"),
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
  await seedTestNode(fixture, { id: bookB, properties: { title: "Book B" } });
  await seedTestNode(fixture, { id: part1, properties: { title: "Part 1" } });
  await seedTestNode(fixture, { id: part2, properties: { title: "Part 2" } });

  await seedTestRelationships(fixture, [
    { source: bookA, target: PRODUCTS_DB, type: "ordered_member_of", properties: { order: "1" } },
    { source: bookB, target: PRODUCTS_DB, type: "ordered_member_of", properties: { order: "2" } },
    { source: part1, target: PARTS_DB, type: "ordered_member_of", properties: { order: "1" } },
    { source: part2, target: PARTS_DB, type: "ordered_member_of", properties: { order: "2" } },
  ]);

  await seedTestCompositeRelationships(fixture, [
    {
      a: part1,
      b: bookA,
      typeFromA: "Products",
      typeFromB: "Parts database",
      relationshipTypeId: "000000000000000000000000A5",
      properties: { ordinal: 0 },
    },
    {
      a: part2,
      b: bookA,
      typeFromA: "Products",
      typeFromB: "Parts database",
      relationshipTypeId: "000000000000000000000000A5",
      properties: { ordinal: 0 },
    },
  ]);

  for (let i = 0; i < 40; i++) {
    const id = `SC${String(i).padStart(24, "0")}`;
    await seedTestNode(fixture, { id, properties: { title: `Scene ${String(i).padStart(2, "0")}` } });
    await seedTestRelationships(fixture, [
      {
        source: id,
        target: SCENES_DB,
        type: "ordered_member_of",
        properties: { order: String((i + 1) * 10) },
      },
    ]);
    const book = i < 30 ? bookA : bookB;
    const part = i % 2 === 0 ? part1 : part2;
    await seedTestCompositeRelationships(fixture, [
      {
        a: id,
        b: book,
        typeFromA: "Scenes",
        typeFromB: "Product",
        relationshipTypeId: "000000000000000000000000A3",
        properties: { ordinal: 0 },
      },
      ...(i < 30
        ? [
            {
              a: id,
              b: part,
              typeFromA: "Scenes" as const,
              typeFromB: "Part" as const,
              relationshipTypeId: "000000000000000000000000A4",
              properties: { ordinal: 0 },
            },
          ]
        : []),
    ]);
  }

  const registry = fixture.ctx.store.readRelationshipTypesFile();
  registry.relationshipTypes["000000000000000000000000A3"] = {
    perspectives: ["Scenes", "Product"],
    endpoints: {
      0: { typeId: SCENES_DB },
      1: { typeId: PRODUCTS_DB },
    },
  };
  registry.relationshipTypes["000000000000000000000000A4"] = {
    perspectives: ["Scenes", "Part"],
    endpoints: {
      0: { typeId: SCENES_DB },
      1: { typeId: PARTS_DB },
    },
  };
  registry.relationshipTypes["000000000000000000000000A5"] = {
    perspectives: ["Products", "Parts database"],
    endpoints: {
      0: { typeId: PARTS_DB },
      1: { typeId: PRODUCTS_DB },
    },
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
  seedTestDynamicProperties(fixture, []);

  afterAll(async () => await destroyTestContentFixture(fixture));

  const db = () => fixture.ctx.graphStore as import("../src/graph-store/composed-graph-store").ComposedGraphStore;
  const contentDir = () => fixture.ctx.store.contentDir;

  test("SQL-windows composed view by scope with bounded page size", async () => {
    const page = await getDatabaseViewDetail(db(), SCENES_DB, bookA, contentDir(), {
      limit: 10,
      offset: 0,
    });
    expect(page?.presentation?.compositionId).toBe(SCENES_DB);
    expect(page?.presentation?.scopeId).toBe(bookA);
    expect(page?.rowsWindow).toEqual({
      offset: 0,
      limit: 10,
      total: 30,
      hasMore: true,
    });
    expect(page?.rows).toHaveLength(10);
    expect(page?.groups?.length).toBeGreaterThan(0);
    // Flatten order: Part 1 (even scenes) then Part 2 — first row is Scene 00
    expect(page?.rows[0]?.name).toBe("Scene 00");
  });

  test("SQL composed window second page continues group flatten order", async () => {
    const page = await getDatabaseViewDetail(db(), SCENES_DB, bookA, contentDir(), {
      limit: 10,
      offset: 10,
    });
    expect(page?.rowsWindow).toEqual({
      offset: 10,
      limit: 10,
      total: 30,
      hasMore: true,
    });
    expect(page?.rows).toHaveLength(10);
  });

  test("q without searcher returns empty composed search window", async () => {
    db().setSearch(null);
    const page = await getDatabaseViewDetail(db(), SCENES_DB, bookA, contentDir(), {
      limit: 5,
      offset: 0,
      q: "Scene 01",
    });
    expect(page?.rowsWindow.total).toBe(0);
    expect(page?.rows).toHaveLength(0);
  });

  test("q with searcher windows composed members via scoped search", async () => {
    const cache = fixture.ctx.cache;
    const pattern = (q: string) => `%${q.replace(/[%_\\]/g, "\\$&")}%`;
    db().setSearch({
      search() {
        return [];
      },
      async searchWindow(request: {
        query: string;
        limit?: number | null;
        offset?: number;
        allowedNodeIds?: ReadonlySet<string>;
      }) {
        const result = await cache.searchNodesLikeWindow(pattern(request.query), {
          offset: request.offset,
          limit: request.limit,
          allowedNodeIds: request.allowedNodeIds,
        });
        return {
          hits: result.rows.map((row) => ({ id: row.id, title: row.title })),
          total: result.total,
        };
      },
    });
    const page = await getDatabaseViewDetail(db(), SCENES_DB, bookA, contentDir(), {
      limit: 5,
      offset: 0,
      q: "Scene 01",
    });
    expect(page?.rowsWindow.total).toBe(1);
    expect(page?.rows.map((r) => r.name)).toEqual(["Scene 01"]);
    db().setSearch(null);
  });
});
