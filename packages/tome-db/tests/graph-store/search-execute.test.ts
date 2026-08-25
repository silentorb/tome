import { afterAll, describe, expect, test } from "bun:test";
import { searchNodesGraph } from "../../src/graph-store/standard-graphs";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
  type TestContentFixture,
} from "../../src/content/test-helpers";

describe("searchNodesGraph via executeImp", () => {
  const fixture: TestContentFixture = createTestContentFixture("tome-db-search-imp-");
  const titleMatchId = "0000000000000000000000002F";
  const bodyOnlyId = "0000000000000000000000002R";

  seedTestNode(fixture, {
    id: titleMatchId,
    properties: {
      title: "Surreal Title Match",
      body: "no marker here",
    },
  });
  seedTestNode(fixture, {
    id: bodyOnlyId,
    properties: {
      title: "Unrelated",
      body: "contains surreal-body-marker text",
    },
  });

  test("title hits rank above body-only hits", () => {
    const executed = fixture.ctx.graphStore.executeImp(searchNodesGraph(10), {
      parameters: { query: "surreal" },
    });
    expect(executed instanceof Promise).toBe(false);
    if (executed instanceof Promise) return;
    const ids = executed.rows.map((row) => String(row.id));
    expect(ids.indexOf(titleMatchId)).toBeLessThan(ids.indexOf(bodyOnlyId));
  });

  test("body-only hits include matchPreview", () => {
    const executed = fixture.ctx.graphStore.executeImp(searchNodesGraph(10), {
      parameters: { query: "surreal-body-marker" },
    });
    expect(executed instanceof Promise).toBe(false);
    if (executed instanceof Promise) return;
    const bodyRow = executed.rows.find((row) => String(row.id) === bodyOnlyId);
    expect(bodyRow?.matchPreview).toBeDefined();
  });

  afterAll(() => {
    destroyTestContentFixture(fixture);
  });
});
