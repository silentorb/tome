import { describe, expect, test, afterAll } from "bun:test";
import { IS_A_TYPE, typeTableMarkerProperties, VIEWS_FILE_VERSION } from "tome-db";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestCompositeRelationships,
  seedTestRelationships,
  seedTestNode,
  seedTestViews,
} from "tome-db/content/test-helpers";
import { createTestApiFromContent } from "./test-api-setup";

const SCENES_DB = "204dba198db74611b0b49a98dd53e8f5";
const PARTS_DB = "5e45eefc69a14f45b988ad1f3c9d1ef5";
const PRODUCTS_DB = "4e973268d3474f71bd7992094fb39663";

const book = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const part = "11111111111111111111111111111111";
const scene1 = "33333333333333333333333333333333";
const scene2 = "44444444444444444444444444444444";

describe("ordered-associations API", () => {
  const fixture = createTestContentFixture("tome-ordered-api-");

  seedTestNode(fixture, { id: PRODUCTS_DB, properties: typeTableMarkerProperties("Products") });
  seedTestNode(fixture, { id: PARTS_DB, properties: typeTableMarkerProperties("Parts database") });
  seedTestNode(fixture, { id: SCENES_DB, properties: typeTableMarkerProperties("Scenes") });
  seedTestNode(fixture, { id: book, properties: { title: "TWOLD" } });
  seedTestNode(fixture, { id: part, properties: { title: "Part 1" } });
  seedTestNode(fixture, { id: scene1, properties: { title: "Scene One" } });
  seedTestNode(fixture, { id: scene2, properties: { title: "Scene Two" } });
  seedTestRelationships(fixture, [
    { source: book, target: PRODUCTS_DB, type: IS_A_TYPE, properties: { order: "1", row_index: 0 } },
    { source: part, target: PARTS_DB, type: IS_A_TYPE, properties: { row_index: 0 } },
    { source: scene1, target: SCENES_DB, type: IS_A_TYPE, properties: { order: "10" } },
    { source: scene2, target: SCENES_DB, type: IS_A_TYPE, properties: { order: "20" } },
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
    nodes: {
      [SCENES_DB]: {
        sections: {
          items: { tabs: { kind: "generated", provider: "scenes-by-book" } },
        },
      },
    },
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
