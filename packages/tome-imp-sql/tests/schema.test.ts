import { describe, expect, test } from "bun:test";
import type { Graph } from "imp-spec";
import {
  applyLiveNodesConstraint,
  compileImpGraphToTomeSql,
  projectionType,
  tomeLiveNodesSchema,
  tomeNodesColumnExpression,
} from "../src/index";

/** Crockford ULID (26 chars); matches Tome association id shape. */
const VALID_ASSOCIATION = "00000000000000000000000001";

describe("tome-imp-sql schema", () => {
  test("maps property columns to json_extract", () => {
    expect(tomeNodesColumnExpression("id")).toBe("id");
    expect(tomeNodesColumnExpression("title")).toBe("json_extract(properties, '$.title')");
  });

  test("rejects invalid column names", () => {
    expect(() => tomeNodesColumnExpression("title; drop")).toThrow();
  });

  test("applyLiveNodesConstraint rewrites FROM nodes", () => {
    const { sql } = applyLiveNodesConstraint('select * from "nodes"', []);
    expect(sql).toContain('where "is_archived" = 0');
    expect(sql).toContain('as "nodes"');
  });

  test("applyLiveNodesConstraint rewrites JOIN nodes aliases", () => {
    const { sql } = applyLiveNodesConstraint(
      'select * from "nodes" as "sources" inner join "nodes" as "targets" on 1',
      [],
    );
    expect(sql.match(/is_archived" = 0/g)?.length).toBe(2);
    expect(sql).toContain('as "targets"');
  });

  test("tomeLiveNodesSchema exposes relationship_projections edges", () => {
    expect(tomeLiveNodesSchema.table).toBe("nodes");
    expect(tomeLiveNodesSchema.edges?.table).toBe("relationship_projections");
    expect(tomeLiveNodesSchema.edges?.sourceColumn).toBe("source_node_id");
    expect(tomeLiveNodesSchema.edges?.targetColumn).toBe("target_node_id");
    expect(tomeLiveNodesSchema.edges?.typeColumn).toBe("type");
  });

  test("projectionType encodes association and direction", () => {
    expect(projectionType(VALID_ASSOCIATION, 0)).toBe(`${VALID_ASSOCIATION}:0`);
    expect(projectionType(VALID_ASSOCIATION, 1)).toBe(`${VALID_ASSOCIATION}:1`);
  });

  test("projectionType rejects invalid association ids", () => {
    expect(() => projectionType("not-a-ulid", 0)).toThrow();
  });
});

describe("tome-imp-sql compile", () => {
  test("compiles traverse against relationship_projections", () => {
    const edgeType = projectionType(VALID_ASSOCIATION, 0);
    const graph: Graph = {
      nodes: {
        in: { id: "in", type: "input", inputs: {} },
        hop: {
          id: "hop",
          type: "traverse",
          inputs: { edgeType },
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
    expect(sql).toContain("relationship_projections");
    expect(sql).toContain("source_node_id");
    expect(sql).toContain("target_node_id");
    expect(sql).toContain('is_archived" = 0');
    expect(parameters).toContain(edgeType);
  });

  test("compiles except + traverse as NOT EXISTS over relationship_projections", () => {
    const edgeType = projectionType(VALID_ASSOCIATION, 0);
    const graph: Graph = {
      nodes: {
        in: { id: "in", type: "input", inputs: {} },
        hop: {
          id: "hop",
          type: "traverse",
          inputs: { edgeType },
        },
        except: { id: "except", type: "except", inputs: {} },
        out: { id: "out", type: "output", inputs: {} },
      },
      edges: {
        e_keep: {
          from: { node: "in", port: "value" },
          to: { node: "except", port: "collection" },
        },
        e_hop_in: {
          from: { node: "in", port: "value" },
          to: { node: "hop", port: "collection" },
        },
        e_excl: {
          from: { node: "hop", port: "collection" },
          to: { node: "except", port: "exclude" },
        },
        e_out: {
          from: { node: "except", port: "collection" },
          to: { node: "out", port: "value" },
        },
      },
    };

    const { sql, parameters } = compileImpGraphToTomeSql(graph);
    expect(sql.toLowerCase()).toContain("not exists");
    expect(sql).toContain("relationship_projections");
    expect(sql).toContain('is_archived" = 0');
    expect(parameters).toContain(edgeType);
  });
});
