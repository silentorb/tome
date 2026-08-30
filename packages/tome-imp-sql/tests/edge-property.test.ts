import { describe, expect, test } from "bun:test";
import type { Graph } from "imp-core-types";
import type { SchemaFile } from "tome-flatfile/schema-file";
import { compileImpGraphToTomeSql } from "../src/compile";

const MARLOTH_LIKE_SCHEMA: SchemaFile = {
  version: 1,
  relationshipRules: [],
  enums: {
    priority: {
      options: ["Consideration", "Low", "Medium", "High"],
      default: "Low",
      defaultOrder: "desc",
      values: { Low: 1, Medium: 2, High: 4, Consideration: 0 },
    },
  },
};

function considerationHopGraph(): Graph {
  return {
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
}

describe("tome-imp-sql edge property filter", () => {
  test("traverse with edge_property emits json_extract on relationship_projections", () => {
    const { sql, parameters } = compileImpGraphToTomeSql(considerationHopGraph());
    expect(sql.toLowerCase()).toContain("json_extract");
    expect(sql).toContain("$.priority");
    expect(sql).toContain("relationship_projections");
    expect(parameters).toContain("Consideration");
  });

  test("schema encodes enum edge_equals to cache index", () => {
    const { parameters } = compileImpGraphToTomeSql(considerationHopGraph(), {
      schema: MARLOTH_LIKE_SCHEMA,
    });
    expect(parameters).toContain(0);
    expect(parameters).not.toContain("Consideration");
  });

  test("schema encodes enum label in node column equals filter", () => {
    const graph: Graph = {
      nodes: {
        in: { id: "in", type: "input", inputs: {} },
        col: { id: "col", type: "column", inputs: { name: "priority" } },
        lit: { id: "lit", type: "literal", inputs: { value: "Consideration" } },
        eq: { id: "eq", type: "equals", inputs: {} },
        filter: { id: "filter", type: "filter", inputs: {} },
        out: { id: "out", type: "output", inputs: {} },
      },
      edges: {
        e_col: { from: { node: "col", port: "value" }, to: { node: "eq", port: "left" } },
        e_lit: { from: { node: "lit", port: "value" }, to: { node: "eq", port: "right" } },
        e_pred: {
          from: { node: "eq", port: "value" },
          to: { node: "filter", port: "predicate" },
        },
        e_in: {
          from: { node: "in", port: "value" },
          to: { node: "filter", port: "collection" },
        },
        e_out: {
          from: { node: "filter", port: "collection" },
          to: { node: "out", port: "value" },
        },
      },
    };
    const { parameters } = compileImpGraphToTomeSql(graph, { schema: MARLOTH_LIKE_SCHEMA });
    expect(parameters).toContain(0);
    expect(parameters).not.toContain("Consideration");
  });
});
