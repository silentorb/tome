import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestCompositeRelationships,
  seedTestNode,
  seedTestRelationships,
  TEST_HOME_NODE_ID,
  TEST_MEMBER_OF_ASSOCIATION_ID,
} from "tome-db/content/test-helpers";
import { openFlatfileQueryableGraphStore } from "../../src/graph-store/composed-graph-store";
import {
  listRelationshipsFromSource,
} from "../../src/graph-store/relationship-read";
import { recentNodesGraph } from "../../src/graph-store/standard-graphs";
import { projectionTypeForEndpoint } from "tome-flatfile";

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

  test("listRelationshipProjections without SQLite", () => {
    const fixture = createTestContentFixture();
    try {
      const typeTableId = "TTTTTTTTTTTTTTTTTTTTTTTTTT";
      const memberId = "MMMMMMMMMMMMMMMMMMMMMMMMMM";
      seedTestNode(fixture, { id: typeTableId, properties: { title: "Types" } });
      seedTestNode(fixture, { id: memberId, properties: { title: "Member" } });
      seedTestRelationships(fixture, [
        { source: memberId, target: typeTableId, type: "member_of" },
      ]);
      fixture.ctx.cache.close();

      const store = openFlatfileQueryableGraphStore({
        contentPath: fixture.ctx.store.contentDir,
      });
      const setProjection = projectionTypeForEndpoint(TEST_MEMBER_OF_ASSOCIATION_ID, 0);
      const memberProjection = projectionTypeForEndpoint(TEST_MEMBER_OF_ASSOCIATION_ID, 1);

      const fromMember = listRelationshipsFromSource(store, memberId, memberProjection);
      expect(fromMember).toHaveLength(1);
      expect(fromMember[0]?.targetNodeId).toBe(typeTableId);

      const fromType = listRelationshipsFromSource(store, typeTableId, setProjection);
      expect(fromType).toHaveLength(1);
      expect(fromType[0]?.targetNodeId).toBe(memberId);

      store.close();
    } finally {
      destroyTestContentFixture(fixture);
    }
  });
});
