import type { Graph } from "imp-core-types";
import {
  isImpGraph,
  isReactFlowEnvelope,
  layoutForImpGraph,
  parseLayout,
  reactFlowToImpAndLayout,
  type GraphLayout,
} from "tome-imp-view/layout";
import { defaultImpGraph as defaultQueryImpGraph } from "tome-query/config";

export const SEQUENCING_BLOCK_VERSION = 1;
export const IMPLEMENTATION_ID = "tome-sequencing";
export const COMPONENT_ID = "tome-sequencing";
/** Fence `type=` role resolved via component `roles`. */
export const BLOCK_ROLE = "tome-sequencing";

/** Sentinel replaced with the host page node id at execute time. */
export const PAGE_NODE_ID_LITERAL = "$pageNodeId";

export interface SequencingBlockData {
  version: typeof SEQUENCING_BLOCK_VERSION;
  graph: Graph;
  layout: GraphLayout;
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

export function defaultLayout(): GraphLayout {
  return layoutForImpGraph(defaultPageScopedImpGraph(), {
    in: { x: 40, y: 120 },
    col: { x: 40, y: 240 },
    lit: { x: 40, y: 360 },
    eq: { x: 220, y: 300 },
    filter: { x: 400, y: 120 },
    out: { x: 600, y: 120 },
  });
}

export function defaultBlockData(): SequencingBlockData {
  return {
    version: SEQUENCING_BLOCK_VERSION,
    graph: defaultPageScopedImpGraph(),
    layout: defaultLayout(),
  };
}

export function parseSequencingBlockData(raw: unknown): SequencingBlockData {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return defaultBlockData();
  }
  const record = raw as Record<string, unknown>;

  if (isImpGraph(record.graph)) {
    return {
      version: SEQUENCING_BLOCK_VERSION,
      graph: record.graph,
      layout: parseLayout(record.layout),
    };
  }

  if (isReactFlowEnvelope(record.reactFlow)) {
    const { graph, layout } = reactFlowToImpAndLayout(record.reactFlow);
    return {
      version: SEQUENCING_BLOCK_VERSION,
      graph,
      layout,
    };
  }

  return defaultBlockData();
}

/** Replace `$pageNodeId` string literals in Imp node inputs. */
export function bindPageNodeId(graph: Graph, pageNodeId: string): Graph {
  let changed = false;
  const nodes: Graph["nodes"] = { ...graph.nodes };
  for (const [id, node] of Object.entries(graph.nodes)) {
    const values = node.inputs;
    if (!values || typeof values !== "object") continue;
    let nodeChanged = false;
    const next = { ...values };
    for (const [key, value] of Object.entries(values)) {
      if (value === PAGE_NODE_ID_LITERAL) {
        next[key] = pageNodeId;
        nodeChanged = true;
      }
    }
    if (!nodeChanged) continue;
    changed = true;
    nodes[id] = { ...node, inputs: next };
  }
  if (!changed) return graph;
  return { ...graph, nodes };
}

export { defaultQueryImpGraph };
