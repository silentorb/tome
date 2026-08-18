import { describe, expect, test } from "bun:test";
import type { Graph } from "imp-spec";
import { compileImpGraphToTomeSql } from "../src/compile";

describe("tome-imp-sql edge property filter", () => {
  test("traverse with edge_property emits json_extract on relationship_projections", () => {
    const graph: Graph = {
      nodes: {
        in: { id: "in", type: "input", inputs: {} },
        hop: {
          id: "hop",
          type: "traverse",
          inputs: {
            association: "01KXBNPNJDENZ9BXN5BYZ7JKPT",
            direction: 0,
            edge_property: "priority",
            edge_equals: "Consideration",
          },
        },
        out: { id: "out", type: "output", inputs: {} },
      },
      edges: {
        e1: {
          from: { node: "in", port: "value" },
          to: { node: "hop", port: "collection" },
        },
        e2: {
          from: { node: "hop", port: "collection" },
          to: { node: "out", port: "value" },
        },
      },
    };
    const { sql, parameters } = compileImpGraphToTomeSql(graph);
    expect(sql.toLowerCase()).toContain("json_extract");
    expect(sql).toContain("$.priority");
    expect(sql).toContain("relationship_projections");
    expect(parameters).toContain("Consideration");
  });
});
