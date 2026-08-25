import { describe, expect, test } from "bun:test";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
  seedTestRelationships,
  seedTestTableSchema,
  TEST_HOME_NODE_ID,
  TEST_RELATED_ASSOCIATION_ID,
  projectionTypeForEndpoint,
} from "tome-db/content/test-helpers";
import { getDatabaseViewDetail } from "../../src/database-view";
import { getRelationTableSection } from "../../src/node-page-sections";
import { openFlatfileQueryableGraphStore } from "../../src/graph-store/composed-graph-store";
import { typeTableMarkerProperties } from "../../src/node-capabilities";

const TYPE_TABLE = "TTTTTTTTTTTTTTTTTTTTTTTTTT";
const MEMBER = "MMMMMMMMMMMMMMMMMMMMMMMMMM";
const TARGET = "NNNNNNNNNNNNNNNNNNNNNNNNNN";

describe("table views flatfile", () => {
  test("database view and relation table without SQLite cache", () => {
    const fixture = createTestContentFixture("tome-table-views-flatfile-");
    try {
      seedTestNode(fixture, {
        id: TEST_HOME_NODE_ID,
        properties: { title: "Home", modified_at: "2026-01-01T00:00:00.000Z" },
      });
      seedTestNode(fixture, {
        id: TYPE_TABLE,
        properties: typeTableMarkerProperties("Features"),
      });
      seedTestTableSchema(fixture, TYPE_TABLE, [{ key: "priority", name: "Priority", type: "text" }]);
      seedTestNode(fixture, { id: MEMBER, properties: { title: "Member row", priority: "High" } });
      seedTestNode(fixture, { id: TARGET, properties: { title: "Linked target" } });
      const relatedProjection = projectionTypeForEndpoint(TEST_RELATED_ASSOCIATION_ID, 0);
      seedTestRelationships(fixture, [
        { source: MEMBER, target: TYPE_TABLE, type: "member_of" },
        { source: MEMBER, target: TARGET, type: TEST_RELATED_ASSOCIATION_ID },
      ]);

      fixture.ctx.cache.close();
      const store = openFlatfileQueryableGraphStore({
        contentPath: fixture.ctx.store.contentDir,
      });

      const databaseView = getDatabaseViewDetail(
        store,
        TYPE_TABLE,
        undefined,
        fixture.ctx.store.contentDir,
      );
      expect(databaseView?.rows.some((row) => row.nodeId === MEMBER)).toBe(true);

      const relationSection = getRelationTableSection(store, MEMBER, relatedProjection, {
        contentDir: fixture.ctx.store.contentDir,
      });
      expect(relationSection?.rows.some((row) => row.targetId === TARGET)).toBe(true);

      store.close();
    } finally {
      destroyTestContentFixture(fixture);
    }
  });
});
