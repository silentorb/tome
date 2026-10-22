import { describe, expect, test } from "bun:test";
import type { Graph } from "imp-core-types";
import {
  applyLiveNodesConstraint,
  compileImpGraphToTomeSql,
  corpusColumnPredicateSql,
  corpusNodeIdsPredicateSql,
  spliceCorpusNodes,
} from "../src/index";

function passthroughWithCorpus(spec?: string): Graph {
  return {
    nodes: {
      in: { id: "in", type: "input", inputs: {} },
      corpus: {
        id: "corpus",
        type: "corpus",
        inputs: spec ? { id: spec } : {},
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

describe("tome-imp-sql corpus pre-SQL", () => {
  test("spliceCorpusNodes rewires collection around corpus", () => {
    const spliced = spliceCorpusNodes(passthroughWithCorpus("page"));
    expect(spliced.nodes.corpus).toBeUndefined();
    const edges = Object.values(spliced.edges);
    expect(edges).toEqual([
      {
        from: { node: "in", port: "value" },
        to: { node: "out", port: "value" },
      },
    ]);
  });

  test("applyLiveNodesConstraint can add corpus_id predicate", () => {
    const { sql } = applyLiveNodesConstraint(
      'select * from "nodes"',
      [],
      corpusColumnPredicateSql("translucence"),
    );
    expect(sql).toContain(`and "corpus_id" = 'translucence'`);
    expect(sql).toContain('where "is_archived" = 0');
  });

  test("empty corpus id set compiles to AND 0", () => {
    expect(corpusNodeIdsPredicateSql([])).toBe("and 0");
  });

  test("compile page corpus uses lookup and corpus_id column filter", async () => {
    const { sql } = await compileImpGraphToTomeSql(passthroughWithCorpus("page"), {
      pageNodeId: "home",
      corpus: {
        corpusIdForNode: (id) => (id === "home" ? "translucence" : null),
        nodeIdsInCorpus: () => {
          throw new Error("nodeIdsInCorpus should not run for SQL column predicate");
        },
      },
    });
    expect(sql).toContain(`and "corpus_id" = 'translucence'`);
    expect(sql).not.toContain(`and "id" in`);
  });

  test("compile slug corpus skips page node", async () => {
    const { sql } = await compileImpGraphToTomeSql(passthroughWithCorpus("marloth"), {
      corpus: {
        corpusIdForNode: () => "translucence",
        nodeIdsInCorpus: () => {
          throw new Error("nodeIdsInCorpus should not run for SQL column predicate");
        },
      },
    });
    expect(sql).toContain(`and "corpus_id" = 'marloth'`);
  });

  test("compile with materializeCorpusNodeIds uses id IN", async () => {
    const { sql } = await compileImpGraphToTomeSql(passthroughWithCorpus("marloth"), {
      materializeCorpusNodeIds: true,
      corpus: {
        corpusIdForNode: () => "translucence",
        nodeIdsInCorpus: (corpusId) => (corpusId === "marloth" ? ["m1"] : ["t1"]),
      },
    });
    expect(sql).toContain(`and "id" in ('m1')`);
  });

  test("compile all keeps union (no corpus filter)", async () => {
    const { sql } = await compileImpGraphToTomeSql(passthroughWithCorpus("all"));
    expect(sql).toContain('is_archived" = 0');
    expect(sql).not.toContain("and \"id\" in");
    expect(sql).not.toContain("corpus_id");
  });

  test("compile page without pageNodeId throws", async () => {
    await expect(
      compileImpGraphToTomeSql(passthroughWithCorpus("page"), {
        corpus: {
          corpusIdForNode: () => "x",
          nodeIdsInCorpus: () => [],
        },
      }),
    ).rejects.toThrow(/page node id/);
  });

  test("compile page without corpus lookup throws", async () => {
    await expect(
      compileImpGraphToTomeSql(passthroughWithCorpus("page"), { pageNodeId: "home" }),
    ).rejects.toThrow(/corpusQuery/);
  });
});
