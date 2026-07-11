import { afterAll, describe, expect, test } from "bun:test";
import {
  decodeEnumProperties,
  encodeEnumProperties,
  loadSchemaFromContent,
  typeTableMarkerProperties,
} from "tome-db";
import { GraphDatabase } from "tome-cache-sqlite";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestRelationships,
  seedTestNode,
} from "tome-db/content/test-helpers";
import { createTestApiFromContent } from "./test-api-setup";

describe("edge property API", () => {
  const fixture = createTestContentFixture("tome-editor-edge-");

  const databaseId = "DDDDDDDDDDDDDDDDDDDDDDDDDD";
  const nodeId = "AAAAAAAAAAAAAAAAAAAAAAAAAA";

  seedTestNode(fixture, { id: databaseId, properties: typeTableMarkerProperties("Features") });
  seedTestNode(fixture, { id: nodeId, properties: { title: "Feature" } });
  seedTestRelationships(fixture, [
    { source: nodeId, target: databaseId, type: "member_of", properties: { priority: "Low" } },
  ]);

  const api = createTestApiFromContent(fixture);
  const contentDir = fixture.ctx.store.contentDir;

  test("PATCH database row priority", async () => {
    const res = await api.handler(
      new Request(`http://127.0.0.1/api/databases/${databaseId}/rows/${nodeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ property: "priority", value: "High" }),
      }),
    );
    expect(res.status).toBe(200);

    const verifyDb = new GraphDatabase(api.dbPath, {
      propertyCodec: {
        encode: (properties) => encodeEnumProperties(properties, loadSchemaFromContent(contentDir)),
        decode: (properties) => decodeEnumProperties(properties, loadSchemaFromContent(contentDir)),
      },
    });
    const edge = verifyDb.listRelationshipsFromSource(nodeId, "member_of")[0];
    expect(edge?.properties.priority).toBe("High");
    verifyDb.close();
  });

  test("PATCH rejects numeric priority", async () => {
    const res = await api.handler(
      new Request(`http://127.0.0.1/api/databases/${databaseId}/rows/${nodeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ property: "priority", value: "4" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  afterAll(() => {
    api.handler.close();
    destroyTestContentFixture(fixture);
  });
});
