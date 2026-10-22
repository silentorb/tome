import { describe, expect, test } from "bun:test";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
} from "tome-db/content/test-helpers";
import { queryImpSql } from "../../src/graph-store/query-imp-sql";
import { recentNodesGraph } from "../../src/graph-store/standard-graphs";

describe("queryImpSql", () => {
  test("runs recentNodesGraph on the SQL cache without executeImp", async () => {
    const fixture = await createTestContentFixture("tome-query-imp-sql-");
    try {
      const olderId = "AAAAAAAAAAAAAAAAAAAAAAAAAA";
      const newerId = "BBBBBBBBBBBBBBBBBBBBBBBBBB";
      await seedTestNode(fixture, {
        id: olderId,
        properties: { title: "Older", modified_at: "2024-01-01T00:00:00.000Z" },
      });
      await seedTestNode(fixture, {
        id: newerId,
        properties: { title: "Newer", modified_at: "2024-06-01T00:00:00.000Z" },
      });

      let executeImpCalls = 0;
      const original = fixture.ctx.graphStore.executeImp.bind(fixture.ctx.graphStore);
      fixture.ctx.graphStore.executeImp = async (...args) => {
        executeImpCalls += 1;
        return original(...args);
      };

      const result = await queryImpSql(fixture.ctx.cache, recentNodesGraph(10));
      expect(executeImpCalls).toBe(0);
      const ids = result.rows.map((row) => String(row.id));
      expect(ids.indexOf(newerId)).toBeGreaterThanOrEqual(0);
      expect(ids.indexOf(olderId)).toBeGreaterThanOrEqual(0);
      expect(ids.indexOf(newerId)).toBeLessThan(ids.indexOf(olderId));
      expect(result.columns).toContain("id");
      expect(result.columns).toContain("title");
    } finally {
      await destroyTestContentFixture(fixture);
    }
  });
});
