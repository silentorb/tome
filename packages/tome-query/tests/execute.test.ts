import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { reactFlowToImp } from "imp-react-flow";
import {
  defaultBlockData,
  defaultReactFlowGraph,
  parseQueryBlockData,
  withoutInboundToPort,
} from "../src/config";
import { compileReactFlowQuery, rowsToTable } from "../src/execute";
import { applyLiveNodesConstraint, tomeNodesColumnExpression } from "../src/schema";
import { executeQueryBlock } from "../src/render";

describe("tome-query config", () => {
  test("default block data has input → output react flow graph", () => {
    const data = defaultBlockData();
    expect(data.version).toBe(1);
    expect(data.reactFlow.nodes.map((n) => n.type).sort()).toEqual(["input", "output"]);
    const graph = reactFlowToImp(data.reactFlow.nodes, data.reactFlow.edges);
    expect(Object.keys(graph.nodes)).toContain("in");
    expect(Object.keys(graph.nodes)).toContain("out");
  });

  test("parseQueryBlockData falls back on invalid input", () => {
    const parsed = parseQueryBlockData({ version: 1 });
    expect(parsed.reactFlow.nodes.length).toBe(2);
  });

  test("parseQueryBlockData keeps last inbound edge per target handle", () => {
    const parsed = parseQueryBlockData({
      version: 1,
      reactFlow: {
        nodes: defaultReactFlowGraph().nodes,
        edges: [
          {
            id: "e_stale",
            source: "in",
            target: "out",
            sourceHandle: "value",
            targetHandle: "value",
          },
          {
            id: "e_keep",
            source: "in",
            target: "out",
            sourceHandle: "value",
            targetHandle: "value",
          },
        ],
      },
    });
    expect(parsed.reactFlow.edges).toEqual([
      {
        id: "e_keep",
        source: "in",
        target: "out",
        sourceHandle: "value",
        targetHandle: "value",
      },
    ]);
  });

  test("withoutInboundToPort drops edges to the same target handle", () => {
    const edges = [
      {
        id: "a",
        source: "in",
        target: "out",
        sourceHandle: "value",
        targetHandle: "value",
      },
      {
        id: "b",
        source: "in",
        target: "filter",
        sourceHandle: "value",
        targetHandle: "collection",
      },
    ];
    expect(withoutInboundToPort(edges, "out", "value")).toEqual([edges[1]]);
    expect(withoutInboundToPort(edges, "filter", "collection")).toEqual([edges[0]]);
  });
});

describe("tome-query schema", () => {
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
});

describe("tome-query compile + execute", () => {
  test("compiles default graph over nodes", () => {
    const { sql } = compileReactFlowQuery(defaultReactFlowGraph());
    expect(sql.toLowerCase()).toContain("nodes");
    expect(sql).toContain('is_archived" = 0');
  });

  test("compiles when multiple edges target the same input port", () => {
    const base = defaultReactFlowGraph();
    const { sql } = compileReactFlowQuery({
      ...base,
      edges: [
        ...base.edges,
        {
          id: "e_duplicate",
          source: "in",
          target: "out",
          sourceHandle: "value",
          targetHandle: "value",
        },
      ],
    });
    expect(sql.toLowerCase()).toContain("nodes");
  });

  test("compiles project + filter graph", () => {
    const reactFlow = {
      nodes: [
        {
          id: "in",
          type: "input",
          position: { x: 0, y: 0 },
          data: { inputValues: {} },
        },
        {
          id: "col",
          type: "column",
          position: { x: 0, y: 0 },
          data: { inputValues: { name: "title" } },
        },
        {
          id: "lit",
          type: "literal",
          position: { x: 0, y: 0 },
          data: { inputValues: { value: "Alpha" } },
        },
        {
          id: "eq",
          type: "equals",
          position: { x: 0, y: 0 },
          data: { inputValues: {} },
        },
        {
          id: "filter",
          type: "filter",
          position: { x: 0, y: 0 },
          data: { inputValues: {} },
        },
        {
          id: "project",
          type: "project",
          position: { x: 0, y: 0 },
          data: { inputValues: { columns: "id,title" } },
        },
        {
          id: "out",
          type: "output",
          position: { x: 0, y: 0 },
          data: { inputValues: {} },
        },
      ],
      edges: [
        {
          id: "e1",
          source: "in",
          sourceHandle: "value",
          target: "filter",
          targetHandle: "collection",
        },
        {
          id: "e2",
          source: "col",
          sourceHandle: "value",
          target: "eq",
          targetHandle: "left",
        },
        {
          id: "e3",
          source: "lit",
          sourceHandle: "value",
          target: "eq",
          targetHandle: "right",
        },
        {
          id: "e4",
          source: "eq",
          sourceHandle: "value",
          target: "filter",
          targetHandle: "predicate",
        },
        {
          id: "e5",
          source: "filter",
          sourceHandle: "collection",
          target: "project",
          targetHandle: "collection",
        },
        {
          id: "e6",
          source: "project",
          sourceHandle: "collection",
          target: "out",
          targetHandle: "value",
        },
      ],
    };

    const { sql, parameters } = compileReactFlowQuery(reactFlow);
    expect(sql.toLowerCase()).toContain("where");
    expect(sql.toLowerCase()).toContain("json_extract");
    expect(parameters).toContain("Alpha");
  });

  test("executeQueryBlock excludes archived nodes", async () => {
    const db = new Database(":memory:");
    db.run(`
      CREATE TABLE nodes (
        id TEXT PRIMARY KEY NOT NULL,
        properties TEXT NOT NULL DEFAULT '{}',
        is_archived INTEGER NOT NULL DEFAULT 0
      );
    `);
    db.run(`INSERT INTO nodes (id, properties, is_archived) VALUES (?, ?, ?)`, [
      "live1",
      JSON.stringify({ title: "Live" }),
      0,
    ]);
    db.run(`INSERT INTO nodes (id, properties, is_archived) VALUES (?, ?, ?)`, [
      "arch1",
      JSON.stringify({ title: "Archived" }),
      1,
    ]);

    const table = await executeQueryBlock(
      {
        queryAll(sql, params = []) {
          return db.prepare(sql).all(...(params as never[])) as Record<string, unknown>[];
        },
      },
      defaultReactFlowGraph(),
    );

    const ids = table.rows.map((row) => row.id);
    expect(ids).toContain("live1");
    expect(ids).not.toContain("arch1");
  });

  test("rowsToTable prefers id and title columns", () => {
    const table = rowsToTable([{ title: "A", id: "1", z: 1 }]);
    expect(table.columns[0]).toBe("id");
    expect(table.columns[1]).toBe("title");
  });
});
