import { describe, expect, test } from "bun:test";
import type { Graph } from "imp-spec";
import {
  applyLiveNodesConstraint,
  compileImpGraphToTomeSql,
  corpusIdPredicateSql,
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

  test("applyLiveNodesConstraint can add id IN predicate", () => {
    const { sql } = applyLiveNodesConstraint(
      'select * from "nodes"',
      [],
      corpusIdPredicateSql(["n1", "n2"]),
    );
    expect(sql).toContain(`and "id" in ('n1', 'n2')`);
    expect(sql).toContain('where "is_archived" = 0');
  });

  test("empty corpus id set compiles to AND 0", () => {
    expect(corpusIdPredicateSql([])).toBe("and 0");
  });

  test("compile page corpus uses lookup and id filter", () => {
    const { sql } = compileImpGraphToTomeSql(passthroughWithCorpus("page"), {
      pageNodeId: "home",
      corpus: {
        corpusIdForNode: (id) => (id === "home" ? "translucence" : null),
        nodeIdsInCorpus: (corpusId) =>
          corpusId === "translucence" ? ["a1", "a2"] : ["other"],
      },
    });
    expect(sql).toContain(`and "id" in ('a1', 'a2')`);
    expect(sql).not.toContain("other");
  });

  test("compile slug corpus skips page node", () => {
    const { sql } = compileImpGraphToTomeSql(passthroughWithCorpus("marloth"), {
      corpus: {
        corpusIdForNode: () => "translucence",
        nodeIdsInCorpus: (corpusId) => (corpusId === "marloth" ? ["m1"] : ["t1"]),
      },
    });
    expect(sql).toContain(`and "id" in ('m1')`);
  });

  test("compile all keeps union (no id IN)", () => {
    const { sql } = compileImpGraphToTomeSql(passthroughWithCorpus("all"));
    expect(sql).toContain('is_archived" = 0');
    expect(sql).not.toContain("and \"id\" in");
  });

  test("compile page without pageNodeId throws", () => {
    expect(() => compileImpGraphToTomeSql(passthroughWithCorpus("page"), {
      corpus: {
        corpusIdForNode: () => "x",
        nodeIdsInCorpus: () => [],
      },
    })).toThrow(/page node id/);
  });

  test("compile page without corpus lookup throws", () => {
    expect(() =>
      compileImpGraphToTomeSql(passthroughWithCorpus("page"), { pageNodeId: "home" }),
    ).toThrow(/corpusQuery/);
  });
});
