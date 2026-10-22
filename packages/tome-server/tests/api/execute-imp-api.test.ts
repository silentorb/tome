import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
  TEST_HOME_NODE_ID,
} from "tome-db/content/test-helpers";
import { recentNodesGraph } from "tome-db";
import {
  allowEverythingAuthorizerOptions,
  createApiHandler,
  UserSettingsStore,
} from "tome-http";
import { openTomeGraphServicesDeferred } from "../../src/graph-services";

describe("queryNodes API", async () => {
  test("POST /api/nodes/query runs recentNodesGraph without GraphStore.executeImp", async () => {
    const fixture = await createTestContentFixture("tome-nodes-query-content-");
    await seedTestNode(fixture, {
      id: TEST_HOME_NODE_ID,
      properties: {
        title: "Home",
        modified_at: "2026-01-01T00:00:00.000Z",
      },
    });
    fixture.ctx.sync.fullRebuild();

    let graphStoreExecuteImpCalls = 0;
    const originalExecuteImp = fixture.ctx.graphStore.executeImp.bind(fixture.ctx.graphStore);
    fixture.ctx.graphStore.executeImp = async (...args) => {
      graphStoreExecuteImpCalls += 1;
      return originalExecuteImp(...args);
    };

    const deferred = await openTomeGraphServicesDeferred(null, {
      writeContext: fixture.ctx,
      skipStoreSyncSubscribe: true,
    });
    const settingsPath = join(fixture.tempDir, "user-settings.json");
    const apiHandler = createApiHandler(deferred.services, new UserSettingsStore(settingsPath), {
      ...allowEverythingAuthorizerOptions(),
    });

    const response = await apiHandler(
      new Request("http://127.0.0.1/api/nodes/query", {
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
    expect(graphStoreExecuteImpCalls).toBe(0);

    await apiHandler.close();
    await deferred.services.close();
    await destroyTestContentFixture(fixture);
  });
});
