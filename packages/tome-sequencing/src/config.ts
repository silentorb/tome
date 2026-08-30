import type { ReactFlowGraph } from "imp-react-flow";
import { impToReactFlow } from "imp-react-flow";
import type { Graph } from "imp-core-types";
import {
  dedupeInboundReactFlowEdges,
  defaultReactFlowGraph as defaultQueryReactFlow,
} from "tome-query/config";

export const SEQUENCING_BLOCK_VERSION = 1;
export const IMPLEMENTATION_ID = "tome-sequencing";
export const COMPONENT_ID = "tome-sequencing.block";

/** Sentinel replaced with the host page node id at execute time. */
export const PAGE_NODE_ID_LITERAL = "$pageNodeId";

export interface SequencingBlockData {
  version: typeof SEQUENCING_BLOCK_VERSION;
  reactFlow: ReactFlowGraph;
}

/**
 * Default Imp pipeline: filter to page node → (author adds traverse).
 * Slash-menu default is identity; Arcs content ships a membership traverse graph.
 */
export function defaultPageScopedImpGraph(): Graph {
  return {
    nodes: {
      in: { id: "in", type: "input", inputs: {} },
      col: { id: "col", type: "column", inputs: { name: "id" } },
      lit: { id: "lit", type: "literal", inputs: { value: PAGE_NODE_ID_LITERAL } },
      eq: { id: "eq", type: "equals", inputs: {} },
      filter: { id: "filter", type: "filter", inputs: {} },
      out: { id: "out", type: "output", inputs: {} },
    },
    edges: {
      e_in_filter: {
        from: { node: "in", port: "value" },
        to: { node: "filter", port: "collection" },
      },
      e_col_eq: {
        from: { node: "col", port: "value" },
        to: { node: "eq", port: "left" },
      },
      e_lit_eq: {
        from: { node: "lit", port: "value" },
        to: { node: "eq", port: "right" },
      },
      e_eq_filter: {
        from: { node: "eq", port: "value" },
        to: { node: "filter", port: "predicate" },
      },
      e_filter_out: {
        from: { node: "filter", port: "collection" },
        to: { node: "out", port: "value" },
      },
    },
  };
}

export function defaultReactFlowGraph(): ReactFlowGraph {
  const rf = impToReactFlow(defaultPageScopedImpGraph());
  const positions: Record<string, { x: number; y: number }> = {
    in: { x: 40, y: 120 },
    col: { x: 40, y: 240 },
    lit: { x: 40, y: 360 },
    eq: { x: 220, y: 300 },
    filter: { x: 400, y: 120 },
    out: { x: 600, y: 120 },
  };
  return {
    nodes: rf.nodes.map((node) => ({
      ...node,
      position: positions[node.id] ?? node.position,
    })),
    edges: rf.edges,
  };
}

export function defaultBlockData(): SequencingBlockData {
  return {
    version: SEQUENCING_BLOCK_VERSION,
    reactFlow: defaultReactFlowGraph(),
  };
}

export function parseSequencingBlockData(raw: unknown): SequencingBlockData {
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
    version: SEQUENCING_BLOCK_VERSION,
    reactFlow: {
      nodes: rf.nodes as ReactFlowGraph["nodes"],
      edges: dedupeInboundReactFlowEdges(rf.edges as ReactFlowGraph["edges"]),
    },
  };
}

/** Replace `$pageNodeId` string literals in React Flow node input values. */
export function bindPageNodeId(
  reactFlow: ReactFlowGraph,
  pageNodeId: string,
): ReactFlowGraph {
  return {
    nodes: reactFlow.nodes.map((node) => {
      const values = node.data?.inputValues;
      if (!values || typeof values !== "object") return node;
      let changed = false;
      const next = { ...values };
      for (const [key, value] of Object.entries(values)) {
        if (value === PAGE_NODE_ID_LITERAL) {
          next[key] = pageNodeId;
          changed = true;
        }
      }
      if (!changed) return node;
      return {
        ...node,
        data: { ...node.data, inputValues: next },
      };
    }),
    edges: reactFlow.edges,
  };
}

export { defaultQueryReactFlow };
