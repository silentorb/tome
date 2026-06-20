import { describe, expect, test, afterAll } from "bun:test";
import { typeTableMarkerProperties } from "tome-db";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
  seedTestTableSchema,
  TEST_HOME_NODE_ID,
} from "tome-db/content/test-helpers";
import { createTestApiFromContent } from "./test-api-setup";

const sourceId = "a2222222222222222222222222222222";
const databaseId = "b2222222222222222222222222222222";

describe("node create API", () => {
  const fixture = createTestContentFixture("tome-create-api-");

  seedTestNode(fixture, {
    id: TEST_HOME_NODE_ID,
    properties: { title: "Home" },
  });
  seedTestNode(fixture, {
    id: sourceId,
    properties: { title: "Parent page" },
  });
  seedTestNode(fixture, {
    id: databaseId,
    properties: typeTableMarkerProperties("Features DB"),
  });
  seedTestTableSchema(fixture, databaseId, []);

  const api = createTestApiFromContent(fixture);

  test("POST /api/nodes creates standalone node", async () => {
    const res = await api.handler(
      new Request("http://127.0.0.1/api/nodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Standalone", body: "Hello" }),
      }),
    );
    expect(res.status).toBe(200);
    const payload = (await res.json()) as { node: { id: string; title: string } };
    expect(payload.node.title).toBe("Standalone");

    const nodeRes = await api.handler(new Request(`http://127.0.0.1/api/nodes/${payload.node.id}`));
    expect(nodeRes.status).toBe(200);
    const nodePayload = (await nodeRes.json()) as { node: { title: string; body: string } };
    expect(nodePayload.node.title).toBe("Standalone");
    expect(nodePayload.node.body).toContain("Hello");
  });

  test("POST relation-rows links to source", async () => {
    const res = await api.handler(
      new Request(`http://127.0.0.1/api/nodes/${sourceId}/relation-rows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "features", title: "Linked feature" }),
      }),
    );
    expect(res.status).toBe(200);
    const payload = (await res.json()) as { node: { id: string } };
    const rel = fixture.ctx.store.findRelationship(sourceId, payload.node.id, "features");
    expect(rel).not.toBeNull();
  });

  test("POST database rows creates IS_A membership", async () => {
    const res = await api.handler(
      new Request(`http://127.0.0.1/api/databases/${databaseId}/rows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "DB row", view: "default" }),
      }),
    );
    expect(res.status).toBe(200);
    const payload = (await res.json()) as { node: { id: string } };
    const rel = fixture.ctx.store.findRelationship(payload.node.id, databaseId, "is_a");
    expect(rel).not.toBeNull();
  });


  afterAll(() => {
    api.handler.close();
    destroyTestContentFixture(fixture);
  });
});

describe("connections API", () => {
  const linkSourceId = "f1111111111111111111111111111111";
  const linkTargetId = "f2222222222222222222222222222222";
  const fixture = createTestContentFixture("tome-conn-api-");
  seedTestNode(fixture, { id: linkSourceId, properties: { title: "Link source" } });
  seedTestNode(fixture, { id: linkTargetId, properties: { title: "Link target" } });
  const api = createTestApiFromContent(fixture);

  test("POST and DELETE connections link and unlink existing nodes", async () => {
    const linkRes = await api.handler(
      new Request(`http://127.0.0.1/api/nodes/${linkSourceId}/connections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "features", targetId: linkTargetId }),
      }),
    );
    expect(linkRes.status).toBe(200);
    expect(fixture.ctx.store.findRelationship(linkSourceId, linkTargetId, "features")).not.toBeNull();

    const dupRes = await api.handler(
      new Request(`http://127.0.0.1/api/nodes/${linkSourceId}/connections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "features", targetId: linkTargetId }),
      }),
    );
    expect(dupRes.status).toBe(409);

    const unlinkRes = await api.handler(
      new Request(
        `http://127.0.0.1/api/nodes/${linkSourceId}/connections/${encodeURIComponent("features")}/${linkTargetId}`,
        { method: "DELETE" },
      ),
    );
    expect(unlinkRes.status).toBe(200);
    expect(fixture.ctx.store.findRelationship(linkSourceId, linkTargetId, "features")).toBeNull();
  });

  afterAll(() => {
    api.handler.close();
    destroyTestContentFixture(fixture);
  });
});
