import { describe, expect, test, afterAll } from "bun:test";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
  TEST_ARCHIVE_NODE_ID,
  TEST_GRAPH_ANCHOR_NODE_ID,
  TEST_HOME_NODE_ID,
} from "tome-db/content/test-helpers";
import { createTestApiFromContent } from "./test-api-setup";

describe("GET /api/workspace", () => {
  const fixture = createTestContentFixture("tome-workspace-api-");

  seedTestNode(fixture, {
    id: TEST_ARCHIVE_NODE_ID,
    properties: { title: "Archive hub" },
  });

  const api = createTestApiFromContent(fixture);

  afterAll(() => {
    api.handler.close();
    destroyTestContentFixture(fixture);
  });

  test("returns workspace config from content/model/workspace.json", async () => {
    const res = await api.handler(new Request("http://127.0.0.1/api/workspace"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      homeNodeId: string;
      archiveNodeId: string;
      protectedNodeIds: string[];
      graphExplorer: { defaultAnchorNodeId: string };
      archiveNodeTitle?: string;
    };
    expect(body.homeNodeId).toBe(TEST_HOME_NODE_ID);
    expect(body.archiveNodeId).toBe(TEST_ARCHIVE_NODE_ID);
    expect(body.protectedNodeIds).toEqual([TEST_HOME_NODE_ID, TEST_ARCHIVE_NODE_ID]);
    expect(body.graphExplorer.defaultAnchorNodeId).toBe(TEST_GRAPH_ANCHOR_NODE_ID);
    expect(body.archiveNodeTitle).toBe("Archive hub");
  });
});
