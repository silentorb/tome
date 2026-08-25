import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
  TEST_HOME_NODE_ID,
} from "tome-db/content/test-helpers";
import { recentNodesGraph } from "tome-db";
import { createTestApi } from "./test-api-setup";

describe("executeImp API", () => {
  test("POST /api/graph/execute-imp runs recentNodesGraph", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tome-execute-imp-api-"));
    const dbPath = join(dir, "api.sqlite");

    const fixture = createTestContentFixture("tome-execute-imp-content-");
    seedTestNode(fixture, {
      id: TEST_HOME_NODE_ID,
      properties: {
        title: "Home",
        modified_at: "2026-01-01T00:00:00.000Z",
      },
    });
    fixture.ctx.sync.fullRebuild();

    const { handler: apiHandler } = createTestApi({
      dbPath,
      contentDir: fixture.ctx.store.contentDir,
    });

    const response = await apiHandler(
      new Request("http://127.0.0.1/api/graph/execute-imp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ graph: recentNodesGraph(5) }),
      }),
    );
    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      columns: string[];
      rows: Array<{ id: string }>;
    };
    expect(payload.rows.some((row) => row.id === TEST_HOME_NODE_ID)).toBe(true);

    apiHandler.close();
    destroyTestContentFixture(fixture);
    rmSync(dir, { recursive: true, force: true });
  });
});
