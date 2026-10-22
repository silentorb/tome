import { describe, expect, test } from "bun:test";
import type { Graph } from "imp-core-types";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
} from "tome-db/content/test-helpers";
import { queryImpCollection } from "../../src/graph-store/query-imp-collection";
import { recentNodesGraph, searchNodesGraph } from "../../src/graph-store/standard-graphs";

function passthroughWithCorpus(spec: string): Graph {
  return {
    nodes: {
      in: { id: "in", type: "input", inputs: {} },
      corpus: {
        id: "corpus",
        type: "corpus",
        inputs: { id: spec },
      },
      out: { id: "out", type: "output", inputs: {} },
    },
    edges: {
      e1: {
        from: { node: "in", port: "value" },
        to: { node: "corpus", port: "collection" },
      },
      e2: {
        from: { node: "corpus", port: "collection" },
        to: { node: "out", port: "value" },
      },
    },
  };
}

describe("queryImpCollection", () => {
  test("corpus-free recent graph does not call listNodeIds or executeImp", async () => {
    const fixture = await createTestContentFixture("tome-query-imp-collection-");
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

      let listNodeIdsCalls = 0;
      let executeImpCalls = 0;
      const store = fixture.ctx.graphStore;
      const originalList = store.listNodeIds.bind(store);
      store.listNodeIds = async () => {
        listNodeIdsCalls += 1;
        return originalList();
      };
      const originalExecute = store.executeImp.bind(store);
      store.executeImp = async (...args) => {
        executeImpCalls += 1;
        return originalExecute(...args);
      };

      const result = await queryImpCollection({
        store,
        cache: fixture.ctx.cache,
        graph: recentNodesGraph(10),
      });

      expect(listNodeIdsCalls).toBe(0);
      expect(executeImpCalls).toBe(0);
      const ids = result.rows.map((row) => String(row.id));
      expect(ids.indexOf(newerId)).toBeLessThan(ids.indexOf(olderId));
    } finally {
      await destroyTestContentFixture(fixture);
    }
  });

  test("search graph uses injected TomeSearch without executeImp", async () => {
    const fixture = await createTestContentFixture("tome-query-imp-collection-search-");
    try {
      const hitId = "CCCCCCCCCCCCCCCCCCCCCCCCCC";
      await seedTestNode(fixture, {
        id: hitId,
        properties: { title: "Alpha Hit", modified_at: "2024-06-01T00:00:00.000Z" },
      });

      let executeImpCalls = 0;
      const store = fixture.ctx.graphStore;
      const originalExecute = store.executeImp.bind(store);
      store.executeImp = async (...args) => {
        executeImpCalls += 1;
        return originalExecute(...args);
      };

      let searchCalls = 0;
      const result = await queryImpCollection({
        store,
        cache: fixture.ctx.cache,
        graph: searchNodesGraph(10),
        context: { parameters: { query: "Alpha" }, searchRole: "content" },
        search: {
          search(input) {
            searchCalls += 1;
            expect(input.query).toBe("Alpha");
            return [{ id: hitId, title: "Alpha Hit" }];
          },
          searchWindow: async () => ({ hits: [], total: 0 }),
        },
      });

      expect(executeImpCalls).toBe(0);
      expect(searchCalls).toBe(1);
      expect(result.rows).toEqual([{ id: hitId, title: "Alpha Hit" }]);
    } finally {
      await destroyTestContentFixture(fixture);
    }
  });

  test("corpus operator resolves via lazy lookup without eager listNodeIds before compile", async () => {
    const fixture = await createTestContentFixture("tome-query-imp-collection-corpus-");
    try {
      const nodeId = "DDDDDDDDDDDDDDDDDDDDDDDDDD";
      await seedTestNode(fixture, {
        id: nodeId,
        properties: { title: "In corpus", modified_at: "2024-06-01T00:00:00.000Z" },
      });

      const store = fixture.ctx.graphStore;
      const corpusId = store.locateNode(nodeId);
      expect(corpusId).toBeTruthy();

      let listNodeIdsCalls = 0;
      const originalList = store.listNodeIds.bind(store);
      store.listNodeIds = async () => {
        listNodeIdsCalls += 1;
        return originalList();
      };

      const result = await queryImpCollection({
        store,
        cache: fixture.ctx.cache,
        graph: passthroughWithCorpus(corpusId!),
      });

      // Lazy: listNodeIds runs only when resolving membership, not up-front for every query.
      expect(listNodeIdsCalls).toBe(1);
      expect(result.rows.some((row) => String(row.id) === nodeId)).toBe(true);
    } finally {
      await destroyTestContentFixture(fixture);
    }
  });
});
