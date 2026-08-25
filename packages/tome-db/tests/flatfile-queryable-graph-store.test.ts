import { describe, expect, test } from "bun:test";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
  TEST_HOME_NODE_ID,
} from "tome-db/content/test-helpers";
import { openFlatfileQueryableGraphStore } from "../src/graph-store/composed-graph-store";
import { recentNodesGraph } from "../src/graph-store/standard-graphs";

describe("FlatfileQueryableGraphStore", () => {
  test("executeImp recent graph without SQLite", async () => {
    const fixture = createTestContentFixture();
    try {
      seedTestNode(fixture, {
        id: TEST_HOME_NODE_ID,
        properties: { title: "Home", modified_at: "2026-01-01T00:00:00.000Z" },
      });
      fixture.ctx.cache.close();
      const store = openFlatfileQueryableGraphStore({
        contentPath: fixture.ctx.store.contentDir,
      });
      const result = await store.executeImp(recentNodesGraph(10));
      expect(result.rows.some((row) => row.id === TEST_HOME_NODE_ID)).toBe(true);
      store.close();
    } finally {
      destroyTestContentFixture(fixture);
    }
  });
});
