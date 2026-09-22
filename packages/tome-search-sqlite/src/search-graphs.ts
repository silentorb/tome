import type { ImpGraph } from "tome-graph-interfaces";

function edge(
  fromNode: string,
  fromPort: string,
  toNode: string,
  toPort: string,
): ImpGraph["edges"][string] {
  return { from: { node: fromNode, port: fromPort }, to: { node: toNode, port: toPort } };
}

function literalNode(id: string, value: string | number | boolean | null): ImpGraph["nodes"][string] {
  return { id, type: "literal", inputs: { value } };
}

/** All nodes with fields needed to populate the FTS index. */
export function allNodesForSearchGraph(): ImpGraph {
  return {
    nodes: {
      input: { id: "input", type: "input", inputs: {} },
      project: {
        id: "project",
        type: "project",
        inputs: { columns: "id,title,alias,body" },
      },
      output: { id: "output", type: "output", inputs: {} },
    },
    edges: {
      e1: edge("input", "value", "project", "collection"),
      e2: edge("project", "collection", "output", "value"),
    },
  };
}

/** Single node by id for partial FTS upserts. */
export function nodeByIdForSearchGraph(nodeId: string): ImpGraph {
  const idLit = "id_lit";
  const equalsLeft = "equals_left";
  const equalsRight = "equals_right";
  const equals = "equals";
  const filter = "filter";
  const project = "project";
  const output = "output";
  return {
    nodes: {
      input: { id: "input", type: "input", inputs: {} },
      [idLit]: literalNode(idLit, nodeId),
      [equalsLeft]: { id: equalsLeft, type: "column", inputs: { name: "id" } },
      [equalsRight]: literalNode(equalsRight, nodeId),
      [equals]: { id: equals, type: "equals", inputs: {} },
      [filter]: { id: filter, type: "filter", inputs: {} },
      [project]: {
        id: project,
        type: "project",
        inputs: { columns: "id,title,alias,body" },
      },
      [output]: { id: output, type: "output", inputs: {} },
    },
    edges: {
      e1: edge("input", "value", filter, "collection"),
      e2: edge(filter, "collection", project, "collection"),
      e3: edge(project, "collection", output, "value"),
      e4: edge(equalsLeft, "value", equals, "left"),
      e5: edge(equalsRight, "value", equals, "right"),
      e6: edge(equals, "value", filter, "predicate"),
    },
  };
}
