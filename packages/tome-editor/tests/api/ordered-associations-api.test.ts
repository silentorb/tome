import { describe, expect, test, afterAll } from "bun:test";
import { ORDERED_MEMBER_OF_TYPE, typeTableMarkerProperties, VIEWS_FILE_VERSION } from "tome-db";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestCompositeRelationships,
  seedTestRelationships,
  seedTestNode,
  seedTestTableSchema,
  seedTestViews,
} from "tome-db/content/test-helpers";
import { createTestApiFromContent } from "./test-api-setup";

const SCENES_DB = "0000000000000000000000000D";
const PARTS_DB = "0000000000000000000000000Z";
const PRODUCTS_DB = "0000000000000000000000000S";

const book = "AAAAAAAAAAAAAAAAAAAAAAAAAA";
const part = "11111111111111111111111111";
const scene1 = "33333333333333333333333333";
const scene2 = "44444444444444444444444444";

describe("ordered-associations API", () => {
  const fixture = createTestContentFixture("tome-ordered-api-");

  seedTestNode(fixture, { id: PRODUCTS_DB, properties: typeTableMarkerProperties("Products") });
  seedTestNode(fixture, { id: PARTS_DB, properties: typeTableMarkerProperties("Parts database") });
  seedTestNode(fixture, { id: SCENES_DB, properties: typeTableMarkerProperties("Scenes") });
  seedTestTableSchema(fixture, SCENES_DB, [], "ordered_member_of");
  seedTestTableSchema(fixture, PARTS_DB, [], "ordered_member_of");
  seedTestTableSchema(fixture, PRODUCTS_DB, [], "ordered_member_of");
  seedTestNode(fixture, { id: book, properties: { title: "TWOLD" } });
  seedTestNode(fixture, { id: part, properties: { title: "Part 1" } });
  seedTestNode(fixture, { id: scene1, properties: { title: "Scene One" } });
  seedTestNode(fixture, { id: scene2, properties: { title: "Scene Two" } });
  seedTestRelationships(fixture, [
    { source: book, target: PRODUCTS_DB, type: ORDERED_MEMBER_OF_TYPE, properties: { order: "1" } },
    { source: part, target: PARTS_DB, type: ORDERED_MEMBER_OF_TYPE, properties: { order: "1" } },
    { source: scene1, target: SCENES_DB, type: ORDERED_MEMBER_OF_TYPE, properties: { order: "10" } },
    { source: scene2, target: SCENES_DB, type: ORDERED_MEMBER_OF_TYPE, properties: { order: "20" } },
  ]);
  seedTestCompositeRelationships(fixture, [
    { a: scene1, b: book, typeFromA: "scenes", typeFromB: "product", properties: { ordinal: 0 } },
    { a: scene2, b: book, typeFromA: "scenes", typeFromB: "product", properties: { ordinal: 0 } },
    { a: scene1, b: part, typeFromA: "scenes", typeFromB: "part", properties: { ordinal: 0 } },
    { a: scene2, b: part, typeFromA: "scenes", typeFromB: "part", properties: { ordinal: 1 } },
    { a: part, b: book, typeFromA: "products", typeFromB: "parts_database", properties: { ordinal: 0 } },
  ]);
  seedTestViews(fixture, {
    version: VIEWS_FILE_VERSION,
    views: [
      {
        nodeId: SCENES_DB,
        relationshipType: "ordered_members",
        generator: "scenes-by-book",
      },
    ],
  });

  const api = createTestApiFromContent(fixture);

  test("GET node with tab returns ordered-association section", async () => {
    const res = await api.handler(
      new Request(`http://127.0.0.1/api/nodes/${SCENES_DB}?tab=${book}`),
    );
    expect(res.status).toBe(200);
    const payload = (await res.json()) as {
      node: { sections: Array<{ type: string; configId?: string }> };
    };
    const section = payload.node.sections.find((entry) => entry.type === "ordered-association");
    expect(section?.configId).toBe("scenes-by-book");
  });

  test("PATCH move reorders scenes", async () => {
    const res = await api.handler(
      new Request("http://127.0.0.1/api/ordered-associations/scenes-by-book/move", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scopeId: book,
          sceneId: scene2,
          targetGroupId: part,
          targetIndex: 0,
        }),
      }),
    );
    expect(res.status).toBe(200);
    const payload = (await res.json()) as {
      view: { groups: Array<{ rows: Array<{ sceneId: string }> }> };
    };
    expect(payload.view.groups[0]?.rows[0]?.sceneId).toBe(scene2);
  });

  test("PATCH move rejects invalid payload", async () => {
    const res = await api.handler(
      new Request("http://127.0.0.1/api/ordered-associations/scenes-by-book/move", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scopeId: book }),
      }),
    );
    expect(res.status).toBe(400);
  });

  afterAll(() => {
    api.handler.close();
    destroyTestContentFixture(fixture);
  });
});
