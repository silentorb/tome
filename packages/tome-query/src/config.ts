import type { Graph } from "imp-core-types";
import {
  isImpGraph,
  isReactFlowEnvelope,
  layoutForImpGraph,
  parseLayout,
  reactFlowToImpAndLayout,
  type GraphLayout,
} from "tome-imp-view/layout";

export const QUERY_BLOCK_VERSION = 1;
export const IMPLEMENTATION_ID = "tome-query";
export const COMPONENT_ID = "tome-query";
/** Fence `type=` role resolved via component `roles`. */
export const BLOCK_ROLE = "query";

export interface TomeQueryBlockData {
  version: typeof QUERY_BLOCK_VERSION;
  graph: Graph;
  layout: GraphLayout;
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

export function defaultLayout(): GraphLayout {
  return layoutForImpGraph(defaultImpGraph(), {
    in: { x: 80, y: 120 },
    out: { x: 360, y: 120 },
  });
}

export function defaultBlockData(): TomeQueryBlockData {
  return {
    version: QUERY_BLOCK_VERSION,
    graph: defaultImpGraph(),
    layout: defaultLayout(),
  };
}

export function parseQueryBlockData(raw: unknown): TomeQueryBlockData {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return defaultBlockData();
  }
  const record = raw as Record<string, unknown>;

  if (isImpGraph(record.graph)) {
    return {
      version: QUERY_BLOCK_VERSION,
      graph: record.graph,
      layout: parseLayout(record.layout),
    };
  }

  // Legacy fence: { reactFlow: { nodes, edges } }
  if (isReactFlowEnvelope(record.reactFlow)) {
    const { graph, layout } = reactFlowToImpAndLayout(record.reactFlow);
    return {
      version: QUERY_BLOCK_VERSION,
      graph,
      layout,
    };
  }

  return defaultBlockData();
}
