import { describe, expect, test, afterAll } from "bun:test";
import { typeTableMarkerProperties } from "../src/node-capabilities";
import { getDatabaseViewDetail } from "../src/database-view";
import { createNode } from "../src/node-create";
import {
  mergeScopedSequencePrefix,
  rewriteDatabaseSequence,
} from "../src/table-presentation/rewrite-sequence";
import { UNASSIGNED_GROUP_ID } from "tome-graph-interfaces";
import { getNodePageDetail } from "../src/node-page-sections";
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
import { VIEWS_FILE_VERSION, projectionTypeForEndpoint } from "tome-flatfile";
import { firstRelatedNodeId, loadSemanticRelatedPathContext } from "../src/semantic-related-ids";

const SCENES_DB = "0000000000000000000000000D";
const PARTS_DB = "0000000000000000000000000Z";
const PRODUCTS_DB = "0000000000000000000000000S";
const CHARACTERS_DB = "00000000000000000000000035";
const bookA = "AAAAAAAAAAAAAAAAAAAAAAAAAA";
const bookB = "BBBBBBBBBBBBBBBBBBBBBBBBBB";
const part1 = "11111111111111111111111111";
const part2 = "22222222222222222222222222";
const scene1 = "33333333333333333333333333";
const scene2 = "44444444444444444444444444";
const scene3 = "55555555555555555555555555";
const character1 = "77777777777777777777777777";

describe("table-presentation", async () => {
  const fixture = await createTestContentFixture("tome-table-presentation-");

  await seedTestNode(fixture, { id: PRODUCTS_DB, properties: typeTableMarkerProperties("Products") });
  await seedTestNode(fixture, { id: PARTS_DB, properties: typeTableMarkerProperties("Parts database") });
  await seedTestNode(fixture, { id: CHARACTERS_DB, properties: typeTableMarkerProperties("Characters") });
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
    {
      key: "solutions",
      name: "Solutions",
      type: "relation",
      association: "000000000000000000000000BB",
      endpoint: 0,
    },
    {
      key: "characters",
      name: "📁 Characters",
      type: "relation",
      association: "000000000000000000000000B9",
      endpoint: 0,
    },
    {
      key: "location",
      name: "📁 Location",
      type: "relation",
      association: "000000000000000000000000BA",
      endpoint: 0,
    },
    { key: "order", name: "Order", type: "number" },
  ]);
  await seedTestNode(fixture, { id: bookA, properties: { title: "Book A" } });
  await seedTestNode(fixture, { id: bookB, properties: { title: "Book B" } });
  await seedTestNode(fixture, { id: part1, properties: { title: "Part 1" } });
  await seedTestNode(fixture, { id: part2, properties: { title: "Part 2" } });
  await seedTestNode(fixture, { id: scene1, properties: { title: "Scene One" } });
  await seedTestNode(fixture, { id: scene2, properties: { title: "Scene Two" } });
  await seedTestNode(fixture, { id: scene3, properties: { title: "Scene Three" } });
  await seedTestNode(fixture, { id: character1, properties: { title: "Hero" } });

  await seedTestRelationships(fixture, [
    { source: bookA, target: PRODUCTS_DB, type: "ordered_member_of", properties: { order: "1" } },
    { source: bookB, target: PRODUCTS_DB, type: "ordered_member_of", properties: { order: "2" } },
    { source: part1, target: PARTS_DB, type: "ordered_member_of", properties: { order: "1" } },
    { source: part2, target: PARTS_DB, type: "ordered_member_of", properties: { order: "2" } },
    { source: scene1, target: SCENES_DB, type: "ordered_member_of", properties: { order: "10" } },
    { source: scene2, target: SCENES_DB, type: "ordered_member_of", properties: { order: "20" } },
    { source: scene3, target: SCENES_DB, type: "ordered_member_of", properties: { order: "30" } },
    { source: character1, target: CHARACTERS_DB, type: "member_of" },
  ]);

  await seedTestCompositeRelationships(fixture, [
    { a: scene1, b: bookA, typeFromA: "Scenes", typeFromB: "Product", relationshipTypeId: "000000000000000000000000A3", properties: { ordinal: 0 } },
    { a: scene2, b: bookA, typeFromA: "Scenes", typeFromB: "Product", relationshipTypeId: "000000000000000000000000A3", properties: { ordinal: 0 } },
    { a: scene3, b: bookB, typeFromA: "Scenes", typeFromB: "Product", relationshipTypeId: "000000000000000000000000A3", properties: { ordinal: 0 } },
    { a: scene1, b: part1, typeFromA: "Scenes", typeFromB: "Part", relationshipTypeId: "000000000000000000000000A4", properties: { ordinal: 0 } },
    { a: scene2, b: part1, typeFromA: "Scenes", typeFromB: "Part", relationshipTypeId: "000000000000000000000000A4", properties: { ordinal: 1 } },
    { a: scene3, b: part2, typeFromA: "Scenes", typeFromB: "Part", relationshipTypeId: "000000000000000000000000A4", properties: { ordinal: 0 } },
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
    {
      a: scene1,
      b: character1,
      typeFromA: "Scenes",
      typeFromB: "Characters",
      relationshipTypeId: "000000000000000000000000B9",
      properties: { ordinal: 0 },
    },
  ]);

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
  registry.relationshipTypes["000000000000000000000000BB"] = {
    perspectives: ["Solutions", "Scenes"],
    endpoints: {
      0: { typeId: "0000000000000000000000000T" },
      1: { typeId: SCENES_DB },
    },
  };
  registry.relationshipTypes["000000000000000000000000B9"] = {
    perspectives: ["Scenes", "Characters"],
    endpoints: {
      0: { typeId: SCENES_DB },
      1: { typeId: CHARACTERS_DB },
    },
  };
  registry.relationshipTypes["000000000000000000000000BA"] = {
    perspectives: ["Location", "Scenes"],
    endpoints: {
      0: { typeId: "0000000000000000000000002T" },
      1: { typeId: SCENES_DB },
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

  const db = () => fixture.ctx.graphStore;
  const contentDir = () => fixture.ctx.store.contentDir;
  const pathContext = () => loadSemanticRelatedPathContext(contentDir());
  const view = async (tabId?: string) => await getDatabaseViewDetail(db(), SCENES_DB, tabId, contentDir());

  test("scope layer builds tabs from products that have scenes", async () => {
    const detail = await view();
    expect(detail?.tabs.items.map((tab) => tab.label)).toEqual(["Book A", "Book B"]);
    expect(detail?.tabs.activeTabId).toBe(bookA);
    expect(detail?.presentation).toMatchObject({
      compositionId: SCENES_DB,
      scopeId: bookA,
      sequenced: true,
    });
  });

  test("groups layer partitions scenes by part within the active scope", async () => {
    const detail = await view(bookA);
    expect(detail?.groups?.map((group) => group.title)).toEqual([
      "Part 1",
      "Part 2",
      "Unassigned",
    ]);
    expect(detail?.groups?.[0]?.rows.map((row) => row.name)).toEqual(["Scene One", "Scene Two"]);
    expect(detail?.columns).toEqual(["solutions", "characters", "location"]);
    expect(detail?.columnDefs?.map((col) => col.key)).toEqual([
      "solutions",
      "characters",
      "location",
    ]);
    expect(detail?.columnDefs?.some((col) => col.key === "status")).toBe(false);

    const sceneOne = detail?.groups?.[0]?.rows[0];
    expect(sceneOne?.cells.characters).toBe("Hero");
    expect(sceneOne?.relationCells?.characters?.[0]?.title).toBe("Hero");
  });

  test("group headers sort by group membership order", async () => {
    const detail = await view(bookA);
    const partGroups =
      detail?.groups?.filter((group) => group.groupId !== UNASSIGNED_GROUP_ID) ?? [];
    expect(partGroups.map((group) => group.title)).toEqual(["Part 1", "Part 2"]);
  });

  test("members without a group relation land in the Unassigned group", async () => {
    const unassigned = "66666666666666666666666666";
    await seedTestNode(fixture, { id: unassigned, properties: { title: "Loose Scene" } });
    await seedTestRelationships(fixture, [
      { source: unassigned, target: SCENES_DB, type: "ordered_member_of", properties: { order: "40" } },
    ]);
    await seedTestCompositeRelationships(fixture, [
      { a: unassigned, b: bookA, typeFromA: "Scenes", typeFromB: "Product", relationshipTypeId: "000000000000000000000000A3", properties: { ordinal: 0 } },
    ]);

    const detail = await view(bookA);
    const group = detail?.groups?.find((entry) => entry.groupId === UNASSIGNED_GROUP_ID);
    expect(group?.rows.map((row) => row.name)).toEqual(["Loose Scene"]);
  });

  test("rewriteDatabaseSequence renumbers intrinsic edge order", async () => {
    const updated = await rewriteDatabaseSequence(fixture.ctx, SCENES_DB, {
      orderedRowIds: [scene2, scene1],
      tabId: bookA,
    });

    const partGroup = updated?.groups?.find((group) => group.groupId === part1);
    expect(partGroup?.rows.map((row) => row.nodeId)).toEqual([scene2, scene1]);

    const memberProjection = projectionTypeForEndpoint(TEST_ORDERED_MEMBER_OF_RELATIONSHIP_TYPE_ID, 1);
    const edge1 = await fixture.ctx.cache.getRelationship(`${scene1}:${memberProjection}:${SCENES_DB}`);
    const edge2 = await fixture.ctx.cache.getRelationship(`${scene2}:${memberProjection}:${SCENES_DB}`);
    expect(edge1?.properties.order).toBe("20");
    expect(edge2?.properties.order).toBe("10");
  });

  test("mergeScopedSequencePrefix keeps unloaded remainder after rearranged prefix", () => {
    expect(mergeScopedSequencePrefix(["a", "b", "c", "d"], ["b", "a"])).toEqual([
      "b",
      "a",
      "c",
      "d",
    ]);
    expect(() => mergeScopedSequencePrefix(["a", "b", "c"], ["a", "c"])).toThrow(
      /rearrangement of the loaded scope prefix/,
    );
  });

  test("rewriteDatabaseSequence expands a window prefix across the full scope", async () => {
    const memberProjection = projectionTypeForEndpoint(TEST_ORDERED_MEMBER_OF_RELATIONSHIP_TYPE_ID, 1);
    const extra = [
      "6666666666666666666666666A",
      "6666666666666666666666666B",
      "6666666666666666666666666C",
    ];
    for (let i = 0; i < extra.length; i++) {
      const id = extra[i]!;
      await seedTestNode(fixture, { id, properties: { title: `Extra ${i}` } });
      await seedTestRelationships(fixture, [
        {
          source: id,
          target: SCENES_DB,
          type: "ordered_member_of",
          properties: { order: String(40 + i * 10) },
        },
      ]);
      await seedTestCompositeRelationships(fixture, [
        {
          a: id,
          b: bookA,
          typeFromA: "Scenes",
          typeFromB: "Product",
          relationshipTypeId: "000000000000000000000000A3",
          properties: { ordinal: 0 },
        },
        {
          a: id,
          b: part1,
          typeFromA: "Scenes",
          typeFromB: "Part",
          relationshipTypeId: "000000000000000000000000A4",
          properties: { ordinal: 0 },
        },
      ]);
    }

    // Reset bookA scene1/2 orders so the loaded prefix is stable.
    await seedTestRelationships(fixture, [
      {
        source: scene1,
        target: SCENES_DB,
        type: "ordered_member_of",
        properties: { order: "10" },
      },
      {
        source: scene2,
        target: SCENES_DB,
        type: "ordered_member_of",
        properties: { order: "20" },
      },
    ]);

    const beforeOutOfScope = (
      await fixture.ctx.cache.getRelationship(`${scene3}:${memberProjection}:${SCENES_DB}`)
    )?.properties.order;

    await rewriteDatabaseSequence(fixture.ctx, SCENES_DB, {
      // Window prefix only (first two bookA members); remainder must still renumber.
      orderedRowIds: [scene2, scene1],
      tabId: bookA,
    });

    const edge1 = await fixture.ctx.cache.getRelationship(
      `${scene1}:${memberProjection}:${SCENES_DB}`,
    );
    const edge2 = await fixture.ctx.cache.getRelationship(
      `${scene2}:${memberProjection}:${SCENES_DB}`,
    );
    expect(edge2?.properties.order).toBe("10");
    expect(edge1?.properties.order).toBe("20");

    const remainderOrders: number[] = [];
    for (const id of extra) {
      const edge = await fixture.ctx.cache.getRelationship(
        `${id}:${memberProjection}:${SCENES_DB}`,
      );
      remainderOrders.push(Number(edge?.properties.order));
    }
    // Remainder keeps relative order and continues the sparse 10-step sequence after the prefix.
    expect(remainderOrders).toEqual([...remainderOrders].sort((a, b) => a - b));
    expect(remainderOrders[0]).toBeGreaterThan(Number(edge1?.properties.order));
    expect(remainderOrders.every((order, index) => order === remainderOrders[0]! + index * 10)).toBe(
      true,
    );

    const edge3 = await fixture.ctx.cache.getRelationship(
      `${scene3}:${memberProjection}:${SCENES_DB}`,
    );
    expect(edge3?.properties.order).toBe(beforeOutOfScope);
  });

  test("groupChange moves a member to a different group", async () => {
    const updated = await rewriteDatabaseSequence(fixture.ctx, SCENES_DB, {
      orderedRowIds: [scene2, scene1],
      tabId: bookA,
      groupChange: { rowId: scene1, targetGroupId: part2 },
    });

    const part2Group = updated?.groups?.find((group) => group.groupId === part2);
    expect(part2Group?.rows.some((row) => row.nodeId === scene1)).toBe(true);
    expect(
      await firstRelatedNodeId(
        db(),
        scene1,
        "000000000000000000000000A4",
        SCENES_DB,
        pathContext(),
      ),
    ).toBe(part2);

    const entry = fixture.ctx.store
      .readRelationshipsFile()
      .relationships.find(
        (row) =>
          row.type === "000000000000000000000000A4" &&
          ((row.a === scene1 && row.b === part2) || (row.a === part2 && row.b === scene1)),
      );
    expect(entry).toBeDefined();
    expect(entry?.a).toBe(scene1);
    expect(entry?.b).toBe(part2);
  });

  test("groupChange to Unassigned removes the group relation", async () => {
    await rewriteDatabaseSequence(fixture.ctx, SCENES_DB, {
      orderedRowIds: [scene2, scene1],
      tabId: bookA,
      groupChange: { rowId: scene2, targetGroupId: UNASSIGNED_GROUP_ID },
    });

    expect(
      await firstRelatedNodeId(
        db(),
        scene2,
        "000000000000000000000000A4",
        SCENES_DB,
        pathContext(),
      ),
    ).toBeNull();
  });

  test("Scenes database page emits a composed database section", async () => {
    const detail = await getNodePageDetail(db(), SCENES_DB, { tabId: bookA, contentDir: contentDir() });
    const section = detail?.sections.find((s) => s.type === "database");
    expect(section?.type).toBe("database");
    expect(section?.type === "database" ? section.databaseView.presentation : undefined).
      toMatchObject({ compositionId: SCENES_DB, scopeId: bookA });
    expect(
      section?.type === "database" ? section.databaseView.groups?.map((g) => g.title) : undefined,
    ).toEqual(["Part 1", "Part 2", "Unassigned"]);
  });

  test("createDatabaseRow with scope and group relations appears in the target group", async () => {
    const productProjection = projectionTypeForEndpoint("000000000000000000000000A3", 0);
    const partProjection = projectionTypeForEndpoint("000000000000000000000000A4", 0);
    const created = await createNode(fixture.ctx, {
      title: "Brand New Scene",
      link: {
        kind: "database-row",
        databaseId: SCENES_DB,
        relations: [
          { type: productProjection, targetId: bookA },
          { type: partProjection, targetId: part1 },
        ],
        orderScopeRelations: [{ type: productProjection, targetId: bookA }],
      },
    });
    expect(typeof created).not.toBe("string");
    if (typeof created === "string") return;

    const detail = await view(bookA);
    const partGroup = detail?.groups?.find((group) => group.groupId === part1);
    expect(partGroup?.rows.some((row) => row.nodeId === created.id)).toBe(true);
    expect(
      await firstRelatedNodeId(
        db(),
        created.id,
        "000000000000000000000000A3",
        SCENES_DB,
        pathContext(),
      ),
    ).toBe(bookA);
    expect(
      await firstRelatedNodeId(
        db(),
        created.id,
        "000000000000000000000000A4",
        SCENES_DB,
        pathContext(),
      ),
    ).toBe(part1);
  });

  afterAll(async () => {
    await destroyTestContentFixture(fixture);
  });
});
