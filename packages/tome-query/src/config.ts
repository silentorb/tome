import type { ReactFlowGraph } from "imp-react-flow";
import { impToReactFlow } from "imp-react-flow";
import type { Graph } from "imp-spec";

export const QUERY_BLOCK_VERSION = 1;
export const IMPLEMENTATION_ID = "tome-query";
export const COMPONENT_ID = "tome-query.block";

export interface TomeQueryBlockData {
  version: typeof QUERY_BLOCK_VERSION;
  reactFlow: ReactFlowGraph;
}

/** Default Imp pipeline: input → output (all live nodes, no transforms). */
export function defaultImpGraph(): Graph {
  return {
    nodes: {
      in: { id: "in", type: "input", inputs: {} },
      out: { id: "out", type: "output", inputs: {} },
    },
    edges: {
      e_in_out: {
        from: { node: "in", port: "value" },
        to: { node: "out", port: "value" },
      },
    },
  };
}

export function defaultReactFlowGraph(): ReactFlowGraph {
  const rf = impToReactFlow(defaultImpGraph());
  return {
    nodes: rf.nodes.map((node) => {
      if (node.id === "in") return { ...node, position: { x: 80, y: 120 } };
      if (node.id === "out") return { ...node, position: { x: 360, y: 120 } };
      return node;
    }),
    edges: rf.edges,
  };
}

export function defaultBlockData(): TomeQueryBlockData {
  return {
    version: QUERY_BLOCK_VERSION,
    reactFlow: defaultReactFlowGraph(),
  };
}

export function parseQueryBlockData(raw: unknown): TomeQueryBlockData {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return defaultBlockData();
  }
  const record = raw as Record<string, unknown>;
  const reactFlow = record.reactFlow;
  if (!reactFlow || typeof reactFlow !== "object" || Array.isArray(reactFlow)) {
    return defaultBlockData();
  }
  const rf = reactFlow as Record<string, unknown>;
  if (!Array.isArray(rf.nodes) || !Array.isArray(rf.edges)) {
    return defaultBlockData();
  }
  return {
    version: QUERY_BLOCK_VERSION,
    reactFlow: {
      nodes: rf.nodes as ReactFlowGraph["nodes"],
      edges: rf.edges as ReactFlowGraph["edges"],
    },
  };
}
