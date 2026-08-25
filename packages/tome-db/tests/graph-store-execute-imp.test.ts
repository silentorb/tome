import { describe, expect, test } from "bun:test";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
  TEST_HOME_NODE_ID,
} from "tome-db/content/test-helpers";
import { recentNodesGraph } from "../src/graph-store/standard-graphs";

describe("ComposedGraphStore executeImp", () => {
  test("recentNodesGraph returns live nodes via SQL backend", () => {
    const fixture = createTestContentFixture();
    try {
      seedTestNode(fixture, {
        id: TEST_HOME_NODE_ID,
        properties: { title: "Home", modified_at: "2026-01-01T00:00:00.000Z" },
      });
      const result = fixture.ctx.graphStore.executeImp(recentNodesGraph(10));
      expect(result instanceof Promise).toBe(false);
      if (result instanceof Promise) return;
      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.rows.some((row) => row.id === TEST_HOME_NODE_ID)).toBe(true);
    } finally {
      destroyTestContentFixture(fixture);
    }
  });
});
