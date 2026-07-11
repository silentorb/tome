import { describe, expect, test, afterAll } from "bun:test";
import { typeTableMarkerProperties } from "../src/node-capabilities";
import {
  applyOrderedCollectionMove,
  getOrderedCollectionView,
  UNASSIGNED_GROUP_ID,
} from "../src/ordered-collections";
import { getNodePageDetail } from "../src/node-page-sections";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestCompositeRelationships,
  seedTestRelationships,
  seedTestNode,
  seedTestViews,
  seedTestDynamicFields,
  seedTestTableSchema,
} from "../src/content/test-helpers";
import { VIEWS_FILE_VERSION } from "tome-flatfile";
import { firstRelatedNodeId } from "../src/relationship-traverse";

const SCENES_DB = "0000000000000000000000000D";
const PARTS_DB = "0000000000000000000000000Z";
const PRODUCTS_DB = "0000000000000000000000000S";
const CHARACTERS_DB = "00000000000000000000000035";
const CONFIG_ID = "scenes-by-book";

const bookA = "AAAAAAAAAAAAAAAAAAAAAAAAAA";
const bookB = "BBBBBBBBBBBBBBBBBBBBBBBBBB";
const part1 = "11111111111111111111111111";
const part2 = "22222222222222222222222222";
const scene1 = "33333333333333333333333333";
const scene2 = "44444444444444444444444444";
const scene3 = "55555555555555555555555555";
const character1 = "77777777777777777777777777";

describe("ordered-collections", () => {
  const fixture = createTestContentFixture("tome-ordered-");

  seedTestNode(fixture, { id: PRODUCTS_DB, properties: typeTableMarkerProperties("Products") });
  seedTestNode(fixture, { id: PARTS_DB, properties: typeTableMarkerProperties("Parts database") });
  seedTestNode(fixture, { id: CHARACTERS_DB, properties: typeTableMarkerProperties("Characters") });
  seedTestTableSchema(
    fixture,
    PRODUCTS_DB,
    [],
    "ordered_member_of",
  );
  seedTestTableSchema(fixture, PARTS_DB, [], "ordered_member_of");
  seedTestNode(fixture, {
    id: SCENES_DB,
    properties: typeTableMarkerProperties("Scenes"),
  });
  seedTestTableSchema(
    fixture,
    SCENES_DB,
    [
    {
      key: "product",
      name: "Product",
      type: "relation",
      association: "scenes_product",
    },
    {
      key: "part",
      name: "Part",
      type: "relation",
      association: "scenes_part",
    },
    {
      key: "solutions",
      name: "Solutions",
      type: "relation",
      association: "solutions_scenes",
    },
    {
      key: "characters",
      name: "📁 Characters",
      type: "relation",
      association: "scenes_characters",
    },
    {
      key: "location",
      name: "📁 Location",
      type: "relation",
      association: "scenes_location",
    },
    { key: "order", name: "Order", type: "number" },
  ],
    "ordered_member_of",
  );
  seedTestNode(fixture, { id: bookA, properties: { title: "Book A" } });
  seedTestNode(fixture, { id: bookB, properties: { title: "Book B" } });
  seedTestNode(fixture, { id: part1, properties: { title: "Part 1" } });
  seedTestNode(fixture, { id: part2, properties: { title: "Part 2" } });
  seedTestNode(fixture, { id: scene1, properties: { title: "Scene One" } });
  seedTestNode(fixture, { id: scene2, properties: { title: "Scene Two" } });
  seedTestNode(fixture, { id: scene3, properties: { title: "Scene Three" } });
  seedTestNode(fixture, { id: character1, properties: { title: "Hero" } });

  seedTestRelationships(fixture, [
    { source: bookA, target: PRODUCTS_DB, type: "ordered_member_of", properties: { order: "1" } },
    { source: bookB, target: PRODUCTS_DB, type: "ordered_member_of", properties: { order: "2" } },
    { source: part1, target: PARTS_DB, type: "ordered_member_of", properties: { order: "1" } },
    { source: part2, target: PARTS_DB, type: "ordered_member_of", properties: { order: "2" } },
    { source: scene1, target: SCENES_DB, type: "ordered_member_of", properties: { order: "10" } },
    { source: scene2, target: SCENES_DB, type: "ordered_member_of", properties: { order: "20" } },
    { source: scene3, target: SCENES_DB, type: "ordered_member_of", properties: { order: "30" } },
    { source: character1, target: CHARACTERS_DB, type: "member_of" },
  ]);

  seedTestCompositeRelationships(fixture, [
    { a: scene1, b: bookA, typeFromA: "scenes", typeFromB: "product", properties: { ordinal: 0 } },
    { a: scene2, b: bookA, typeFromA: "scenes", typeFromB: "product", properties: { ordinal: 0 } },
    { a: scene3, b: bookB, typeFromA: "scenes", typeFromB: "product", properties: { ordinal: 0 } },
    { a: scene1, b: part1, typeFromA: "scenes", typeFromB: "part", properties: { ordinal: 0 } },
    { a: scene2, b: part1, typeFromA: "scenes", typeFromB: "part", properties: { ordinal: 1 } },
    { a: scene3, b: part2, typeFromA: "scenes", typeFromB: "part", properties: { ordinal: 0 } },
    {
      a: part1,
      b: bookA,
      typeFromA: "products",
      typeFromB: "parts_database",
      properties: { ordinal: 0 },
    },
    {
      a: part2,
      b: bookA,
      typeFromA: "products",
      typeFromB: "parts_database",
      properties: { ordinal: 0 },
    },
    {
      a: scene1,
      b: character1,
      typeFromA: "scenes",
      typeFromB: "characters",
      properties: { ordinal: 0 },
    },
  ]);

  const registry = fixture.ctx.store.readAssociationsFile();
  registry.associations.scenes_product = {
    perspectives: ["scenes", "product"],
    endpoints: {
      0: { typeId: PRODUCTS_DB },
      1: { typeId: SCENES_DB },
    },
  };
  registry.associations.scenes_part = {
    perspectives: ["scenes", "part"],
    endpoints: {
      0: { typeId: SCENES_DB },
      1: { typeId: PARTS_DB },
    },
  };
  registry.associations.solutions_scenes = {
    perspectives: ["solutions", "scenes"],
    endpoints: {
      0: { typeId: "0000000000000000000000000T" },
      1: { typeId: SCENES_DB },
    },
  };
  registry.associations.scenes_characters = {
    perspectives: ["scenes", "characters"],
    endpoints: {
      0: { typeId: SCENES_DB },
      1: { typeId: CHARACTERS_DB },
    },
  };
  registry.associations.scenes_location = {
    perspectives: ["location", "scenes"],
    endpoints: {
      0: { typeId: "0000000000000000000000002T" },
      1: { typeId: SCENES_DB },
    },
  };
  fixture.ctx.store.writeAssociationsFile(registry);
  fixture.ctx.sync.syncRelationships();

  seedTestViews(fixture, {
    version: VIEWS_FILE_VERSION,
    views: [
      {
        nodeId: SCENES_DB,
        perspective: "ordered_members",
        generator: CONFIG_ID,
      },
    ],
  });
  seedTestDynamicFields(fixture, []);

  const db = () => fixture.ctx.cache;
  const contentDir = () => fixture.ctx.store.contentDir;

  test("builds scopes from products that have scenes", () => {
    const view = getOrderedCollectionView(db(), CONFIG_ID, undefined, contentDir());
    expect(view?.tabs.items.map((tab) => tab.label)).toEqual(["Book A", "Book B"]);
    expect(view?.tabs.activeTabId).toBe(bookA);
  });

  test("groups scenes by part within active scope", () => {
    const view = getOrderedCollectionView(db(), CONFIG_ID, bookA, contentDir());
    expect(view?.groups.map((group) => group.title)).toEqual([
      "Part 1",
      "Part 2",
      "Unassigned",
    ]);
    expect(view?.groups[0]?.rows.map((row) => row.name)).toEqual(["Scene One", "Scene Two"]);
    expect(view?.columns).toEqual(["solutions", "characters", "location"]);
    expect(view?.columnDefs?.map((col) => col.key)).toEqual(["solutions", "characters", "location"]);
    expect(view?.columnDefs?.some((col) => col.key === "status")).toBe(false);

    const sceneOne = view?.groups[0]?.rows[0];
    expect(sceneOne?.cells.characters).toBe("Hero");
    expect(sceneOne?.relationCells?.characters?.[0]?.title).toBe("Hero");
  });

  test("sorts part subsections by order property", () => {
    const view = getOrderedCollectionView(db(), CONFIG_ID, bookA, contentDir());
    const partGroups = view?.groups.filter((group) => group.groupId !== UNASSIGNED_GROUP_ID) ?? [];
    expect(partGroups.map((group) => group.title)).toEqual(["Part 1", "Part 2"]);
  });

  test("places scenes without part in Unassigned group", () => {
    const unassigned = "66666666666666666666666666";
    seedTestNode(fixture, { id: unassigned, properties: { title: "Loose Scene" } });
    seedTestRelationships(fixture, [
      { source: unassigned, target: SCENES_DB, type: "ordered_member_of", properties: { order: "40" } },
    ]);
    seedTestCompositeRelationships(fixture, [
      { a: unassigned, b: bookA, typeFromA: "scenes", typeFromB: "product", properties: { ordinal: 0 } },
    ]);

    const view = getOrderedCollectionView(db(), CONFIG_ID, bookA, contentDir());
    const group = view?.groups.find((entry) => entry.groupId === UNASSIGNED_GROUP_ID);
    expect(group?.rows.map((row) => row.name)).toEqual(["Loose Scene"]);
  });

  test("reorders scenes within a part and renumbers order values", () => {
    const updated = applyOrderedCollectionMove(fixture.ctx, CONFIG_ID, {
      scopeId: bookA,
      sceneId: scene2,
      targetGroupId: part1,
      targetIndex: 0,
    });

    const partGroup = updated?.groups.find((group) => group.groupId === part1);
    expect(partGroup?.rows.map((row) => row.sceneId)).toEqual([scene2, scene1]);

    const edge1 = db().getRelationship(`${scene1}:${"ordered_member_of"}:${SCENES_DB}`);
    const edge2 = db().getRelationship(`${scene2}:${"ordered_member_of"}:${SCENES_DB}`);
    expect(edge1?.properties.order).toBe("20");
    expect(edge2?.properties.order).toBe("10");
  });

  test("moves scene to a different part", () => {
    const updated = applyOrderedCollectionMove(fixture.ctx, CONFIG_ID, {
      scopeId: bookA,
      sceneId: scene1,
      targetGroupId: part2,
      targetIndex: 0,
    });

    const part2Group = updated?.groups.find((group) => group.groupId === part2);
    expect(part2Group?.rows.some((row) => row.sceneId === scene1)).toBe(true);
    expect(firstRelatedNodeId(db(), scene1, "scenes_part")).toBe(part2);

    const entry = fixture.ctx.store
      .readRelationshipsFile()
      .relationships.find(
        (row) =>
          row.type === "scenes_part" &&
          ((row.a === scene1 && row.b === part2) || (row.a === part2 && row.b === scene1)),
      );
    expect(entry).toBeDefined();
    expect(entry?.a).toBe(scene1);
    expect(entry?.b).toBe(part2);
  });

  test("moving to Unassigned removes PART edge", () => {
    applyOrderedCollectionMove(fixture.ctx, CONFIG_ID, {
      scopeId: bookA,
      sceneId: scene2,
      targetGroupId: UNASSIGNED_GROUP_ID,
      targetIndex: 0,
    });

    expect(firstRelatedNodeId(db(), scene2, "scenes_part")).toBeNull();
  });

  test("Scenes database record page emits ordered-collection section", () => {
    const detail = getNodePageDetail(db(), SCENES_DB, { tabId: bookA, contentDir: contentDir() });
    const section = detail?.sections.find((s) => s.type === "ordered-collection");
    expect(section).toMatchObject({
      type: "ordered-collection",
      configId: CONFIG_ID,
    });
  });

  afterAll(() => {
    destroyTestContentFixture(fixture);
  });
});
