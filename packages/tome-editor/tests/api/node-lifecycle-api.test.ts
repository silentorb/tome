import { describe, expect, test, afterAll } from "bun:test";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
  TEST_ARCHIVE_NODE_ID,
  TEST_HOME_NODE_ID,
} from "tome-db/content/test-helpers";
import { createTestApiFromContent } from "./test-api-setup";

const nodeId = "d1111111111111111111111111111111";

describe("node lifecycle API", () => {
  const fixture = createTestContentFixture("tome-lifecycle-api-");

  seedTestNode(fixture, {
    id: TEST_HOME_NODE_ID,
    properties: { title: "Home" },
  });
  seedTestNode(fixture, {
    id: TEST_ARCHIVE_NODE_ID,
    properties: { title: "Archive" },
  });
  seedTestNode(fixture, {
    id: nodeId,
    properties: { title: "Draft" },
  });

  const api = createTestApiFromContent(fixture);

  test("POST archive links node to Archive via includes", async () => {
    const res = await api.handler(new Request(`http://127.0.0.1/api/nodes/${nodeId}/archive`, { method: "POST" }));
    expect(res.status).toBe(200);

    const nodeRes = await api.handler(new Request(`http://127.0.0.1/api/nodes/${nodeId}`));
    const payload = (await nodeRes.json()) as {
      node: { archived: boolean };
    };
    expect(payload.node.archived).toBe(true);
  });

  test("POST archive rejects already archived node", async () => {
    const res = await api.handler(new Request(`http://127.0.0.1/api/nodes/${nodeId}/archive`, { method: "POST" }));
    expect(res.status).toBe(409);
  });

  test("POST unarchive restores archived node", async () => {
    const res = await api.handler(
      new Request(`http://127.0.0.1/api/nodes/${nodeId}/unarchive`, { method: "POST" }),
    );
    expect(res.status).toBe(200);

    const nodeRes = await api.handler(new Request(`http://127.0.0.1/api/nodes/${nodeId}`));
    const payload = (await nodeRes.json()) as {
      node: { archived: boolean };
    };
    expect(payload.node.archived).toBe(false);
  });

  test("POST unarchive rejects non-archived node", async () => {
    const res = await api.handler(
      new Request(`http://127.0.0.1/api/nodes/${nodeId}/unarchive`, { method: "POST" }),
    );
    expect(res.status).toBe(409);
  });

  test("DELETE removes node", async () => {
    const res = await api.handler(new Request(`http://127.0.0.1/api/nodes/${nodeId}`, { method: "DELETE" }));
    expect(res.status).toBe(200);

    const nodeRes = await api.handler(new Request(`http://127.0.0.1/api/nodes/${nodeId}`));
    expect(nodeRes.status).toBe(404);
  });

  test("DELETE rejects protected node", async () => {
    const res = await api.handler(
      new Request(`http://127.0.0.1/api/nodes/${TEST_HOME_NODE_ID}`, { method: "DELETE" }),
    );
    expect(res.status).toBe(403);
  });

  afterAll(() => {
    api.handler.close();
    destroyTestContentFixture(fixture);
  });
});
