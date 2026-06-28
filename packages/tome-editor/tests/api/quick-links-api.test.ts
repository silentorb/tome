import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createApiHandler } from "../../src/api/server";
import { parseWorkspaceFile } from "tome-db";
import { workspaceFilePath } from "tome-db/content";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
} from "tome-db/content/test-helpers";

const NODE_ID = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const OTHER_NODE_ID = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

describe("quick links API", () => {
  test("POST and DELETE /api/nodes/:id/quick-link", async () => {
    const fixture = createTestContentFixture("tome-quick-links-api-");
    try {
      seedTestNode(fixture, { id: NODE_ID, properties: { title: "Features" } });

      const handler = createApiHandler(
        `${fixture.tempDir}/test.sqlite`,
        undefined,
        fixture.ctx.store.contentDir,
      );

      const added = await handler(
        new Request(`http://127.0.0.1/api/nodes/${NODE_ID}/quick-link`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label: "Features", icon: "★" }),
        }),
      );
      expect(added.status).toBe(200);

      const workspaceAfterAdd = parseWorkspaceFile(
        readFileSync(workspaceFilePath(fixture.ctx.store.contentDir), "utf-8"),
      );
      expect(workspaceAfterAdd.quickLinks).toEqual([
        { nodeId: NODE_ID, label: "Features", icon: "★" },
      ]);

      const duplicate = await handler(
        new Request(`http://127.0.0.1/api/nodes/${NODE_ID}/quick-link`, { method: "POST" }),
      );
      expect(duplicate.status).toBe(409);

      const removed = await handler(
        new Request(`http://127.0.0.1/api/nodes/${NODE_ID}/quick-link`, { method: "DELETE" }),
      );
      expect(removed.status).toBe(200);

      const workspaceAfterRemove = parseWorkspaceFile(
        readFileSync(workspaceFilePath(fixture.ctx.store.contentDir), "utf-8"),
      );
      expect(workspaceAfterRemove.quickLinks).toEqual([]);
    } finally {
      destroyTestContentFixture(fixture);
    }
  });

  test("PUT /api/workspace/quick-links/order reorders quick links", async () => {
    const fixture = createTestContentFixture("tome-quick-links-reorder-api-");
    try {
      seedTestNode(fixture, { id: NODE_ID, properties: { title: "First" } });
      seedTestNode(fixture, { id: OTHER_NODE_ID, properties: { title: "Second" } });

      const handler = createApiHandler(
        `${fixture.tempDir}/test.sqlite`,
        undefined,
        fixture.ctx.store.contentDir,
      );

      await handler(
        new Request(`http://127.0.0.1/api/nodes/${NODE_ID}/quick-link`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label: "First", icon: "1" }),
        }),
      );
      await handler(
        new Request(`http://127.0.0.1/api/nodes/${OTHER_NODE_ID}/quick-link`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label: "Second", icon: "2" }),
        }),
      );

      const reordered = await handler(
        new Request("http://127.0.0.1/api/workspace/quick-links/order", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nodeIds: [OTHER_NODE_ID, NODE_ID] }),
        }),
      );
      expect(reordered.status).toBe(200);

      const workspace = parseWorkspaceFile(
        readFileSync(workspaceFilePath(fixture.ctx.store.contentDir), "utf-8"),
      );
      expect(workspace.quickLinks.map((link) => link.nodeId)).toEqual([
        OTHER_NODE_ID,
        NODE_ID,
      ]);
    } finally {
      destroyTestContentFixture(fixture);
    }
  });
});
