import { afterAll, describe, expect, test } from "bun:test";
import { GraphDatabase, IS_A_TYPE, typeTableMarkerProperties } from "tome-db";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestRelationships,
  seedTestNode,
} from "tome-db/content/test-helpers";
import { createTestApiFromContent } from "./test-api-setup";

describe("edge property API", () => {
  const fixture = createTestContentFixture("tome-editor-edge-");

  const databaseId = "dddddddddddddddddddddddddddddddd";
  const nodeId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

  seedTestNode(fixture, { id: databaseId, properties: typeTableMarkerProperties("Features") });
  seedTestNode(fixture, { id: nodeId, properties: { title: "Feature" } });
  seedTestRelationships(fixture, [
    { source: nodeId, target: databaseId, type: IS_A_TYPE, properties: { priority: "Low" } },
  ]);

  const api = createTestApiFromContent(fixture);

  test("PATCH database row priority", async () => {
    const res = await api.handler(
      new Request(`http://127.0.0.1/api/databases/${databaseId}/rows/${nodeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ property: "priority", value: "High" }),
      }),
    );
    expect(res.status).toBe(200);

    const verifyDb = new GraphDatabase(api.dbPath);
    const edge = verifyDb.listRelationshipsFromSource(nodeId, IS_A_TYPE)[0];
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
