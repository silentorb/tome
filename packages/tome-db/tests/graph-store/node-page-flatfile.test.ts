import { describe, expect, test } from "bun:test";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
  seedTestRelationships,
  seedTestTableSchema,
  TEST_HOME_NODE_ID,
} from "tome-db/content/test-helpers";
import { getNodePageDetail } from "../../src/node-page-sections";
import { openFlatfileQueryableGraphStore } from "../../src/graph-store/composed-graph-store";
import { typeTableMarkerProperties } from "../../src/node-capabilities";

const TYPE_TABLE = "TTTTTTTTTTTTTTTTTTTTTTTTTT";
const MEMBER = "MMMMMMMMMMMMMMMMMMMMMMMMMM";

describe("getNodePageDetail flatfile", () => {
  test("loads node page without SQLite cache", () => {
    const fixture = createTestContentFixture("tome-node-page-flatfile-");
    try {
      seedTestNode(
        fixture,
        {
          id: TEST_HOME_NODE_ID,
          properties: { title: "Home", modified_at: "2026-01-01T00:00:00.000Z" },
        },
        "# Home\n",
      );
      seedTestNode(fixture, {
        id: TYPE_TABLE,
        properties: typeTableMarkerProperties("Features"),
      });
      seedTestTableSchema(fixture, TYPE_TABLE, [{ key: "priority", name: "Priority", type: "text" }]);
      seedTestNode(fixture, { id: MEMBER, properties: { title: "Member row" } });
      seedTestRelationships(fixture, [
        { source: MEMBER, target: TYPE_TABLE, type: "member_of" },
      ]);

      fixture.ctx.cache.close();
      const store = openFlatfileQueryableGraphStore({
        contentPath: fixture.ctx.store.contentDir,
      });
      const detail = getNodePageDetail(store, TYPE_TABLE, {
        contentDir: fixture.ctx.store.contentDir,
      });
      expect(detail?.title).toBe("Features");
      expect(detail?.sections.some((s) => s.type === "database")).toBe(true);
      store.close();
    } finally {
      destroyTestContentFixture(fixture);
    }
  });
});
