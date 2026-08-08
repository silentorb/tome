import { describe, expect, test, afterAll } from "bun:test";
import { typeTableMarkerProperties, VIEWS_FILE_VERSION } from "tome-db";
import { createTestContentFixture, destroyTestContentFixture, seedTestCompositeRelationships, seedTestRelationships, seedTestNode, seedTestTableSchema, seedTestViews, TEST_ORDERED_MEMBER_OF_ASSOCIATION_ID } from "tome-db/content/test-helpers";
import { createTestApiFromContent } from "./test-api-setup";

const SCENES_DB = "0000000000000000000000000D";
const PARTS_DB = "0000000000000000000000000Z";
const PRODUCTS_DB = "0000000000000000000000000S";
const UNASSIGNED_GROUP_ID = "__unassigned__";

const book = "AAAAAAAAAAAAAAAAAAAAAAAAAA";
const part = "11111111111111111111111111";
const scene1 = "33333333333333333333333333";
const scene2 = "44444444444444444444444444";

interface DatabaseViewPayload {
  databaseView: {
    presentation?: { compositionId?: string; scopeId?: string; reorderable?: boolean };
    groups?: Array<{ groupId: string; rows: Array<{ nodeId: string }> }>;
  };
}

describe("database members API", () => {
  const fixture = createTestContentFixture("tome-members-api-");

  seedTestNode(fixture, { id: PRODUCTS_DB, properties: typeTableMarkerProperties("Products") });
  seedTestNode(fixture, { id: PARTS_DB, properties: typeTableMarkerProperties("Parts database") });
  seedTestNode(fixture, { id: SCENES_DB, properties: typeTableMarkerProperties("Scenes") });
  seedTestTableSchema(fixture, SCENES_DB, []);
  seedTestTableSchema(fixture, PARTS_DB, []);
  seedTestTableSchema(fixture, PRODUCTS_DB, []);
  seedTestNode(fixture, { id: book, properties: { title: "TWOLD" } });
  seedTestNode(fixture, { id: part, properties: { title: "Part 1" } });
  seedTestNode(fixture, { id: scene1, properties: { title: "Scene One" } });
  seedTestNode(fixture, { id: scene2, properties: { title: "Scene Two" } });
  seedTestRelationships(fixture, [
    { source: book, target: PRODUCTS_DB, type: "ordered_member_of", properties: { order: "1" } },
    { source: part, target: PARTS_DB, type: "ordered_member_of", properties: { order: "1" } },
    { source: scene1, target: SCENES_DB, type: "ordered_member_of", properties: { order: "10" } },
    { source: scene2, target: SCENES_DB, type: "ordered_member_of", properties: { order: "20" } },
  ]);
  seedTestCompositeRelationships(fixture, [
    { a: scene1, b: book, typeFromA: "Scenes", typeFromB: "Product", associationId: "000000000000000000000000A3", properties: { ordinal: 0 } },
    { a: scene2, b: book, typeFromA: "Scenes", typeFromB: "Product", associationId: "000000000000000000000000A3", properties: { ordinal: 0 } },
    { a: scene1, b: part, typeFromA: "Scenes", typeFromB: "Part", associationId: "000000000000000000000000A4", properties: { ordinal: 0 } },
    { a: scene2, b: part, typeFromA: "Scenes", typeFromB: "Part", associationId: "000000000000000000000000A4", properties: { ordinal: 1 } },
    { a: part, b: book, typeFromA: "Products", typeFromB: "Parts database", associationId: "000000000000000000000000A5", properties: { ordinal: 0 } },
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
  registry.associations["000000000000000000000000A5"] = {
    perspectives: ["Products", "Parts database"],
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
      {
        nodeId: PARTS_DB,
        association: TEST_ORDERED_MEMBER_OF_ASSOCIATION_ID,
        generator: "scenes-by-book",
      },
      {
        nodeId: PRODUCTS_DB,
        association: TEST_ORDERED_MEMBER_OF_ASSOCIATION_ID,
        generator: "scenes-by-book",
      },
    ],
  });

  const api = createTestApiFromContent(fixture);

  function reorder(body: unknown): Promise<Response> {
    return api.handler(
      new Request(`http://127.0.0.1/api/databases/${SCENES_DB}/members/reorder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  }

  test("GET node with tab returns a composed database section", async () => {
    const res = await api.handler(
      new Request(`http://127.0.0.1/api/nodes/${SCENES_DB}?tab=${book}`),
    );
    expect(res.status).toBe(200);
    const payload = (await res.json()) as {
      node: {
        sections: Array<{
          type: string;
          databaseView?: DatabaseViewPayload["databaseView"];
        }>;
      };
    };
    const section = payload.node.sections.find((entry) => entry.type === "database");
    expect(section?.databaseView?.presentation).toMatchObject({
      compositionId: "scenes-by-book",
      scopeId: book,
      reorderable: true,
    });
    expect(section?.databaseView?.groups?.map((group) => group.groupId)).toEqual([
      part,
      UNASSIGNED_GROUP_ID,
    ]);
  });

  test("PATCH members/reorder renumbers membership order", async () => {
    const res = await reorder({ orderedMemberIds: [scene2, scene1], tabId: book });
    expect(res.status).toBe(200);
    const payload = (await res.json()) as DatabaseViewPayload;
    const group = payload.databaseView.groups?.find((entry) => entry.groupId === part);
    expect(group?.rows.map((row) => row.nodeId)).toEqual([scene2, scene1]);
  });

  test("PATCH members/reorder applies a group change", async () => {
    const res = await reorder({
      orderedMemberIds: [scene2, scene1],
      tabId: book,
      groupChange: { memberId: scene1, targetGroupId: UNASSIGNED_GROUP_ID },
    });
    expect(res.status).toBe(200);
    const payload = (await res.json()) as DatabaseViewPayload;
    const unassigned = payload.databaseView.groups?.find(
      (entry) => entry.groupId === UNASSIGNED_GROUP_ID,
    );
    expect(unassigned?.rows.map((row) => row.nodeId)).toEqual([scene1]);
  });

  test("PATCH members/reorder rejects a payload without orderedMemberIds", async () => {
    const res = await reorder({ tabId: book });
    expect(res.status).toBe(400);
  });

  afterAll(() => {
    api.handler.close();
    destroyTestContentFixture(fixture);
  });
});
