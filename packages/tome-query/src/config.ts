import type { Graph, ImpFile } from "imp-core-types";
import {
  impGraphFromStored,
  isReactFlowEnvelope,
  layoutForImpGraph,
  parseLayout,
  reactFlowToImpAndLayout,
  storedFromImpGraph,
  type GraphLayout,
} from "tome-imp-view/layout";

export const QUERY_BLOCK_VERSION = 1;
export const IMPLEMENTATION_ID = "tome-query";
export const COMPONENT_ID = "tome-query";
/** Fence `type=` role resolved via component `roles`. */
export const BLOCK_ROLE = "query";

/** Parsed (in-memory) query block. */
export interface TomeQueryBlockData {
  version: typeof QUERY_BLOCK_VERSION;
  graph: Graph;
  layout: GraphLayout;
}

/** Query block as stored in a page fence: the graph is a topology-only Imp file. */
export interface StoredQueryBlockData {
  version: typeof QUERY_BLOCK_VERSION;
  graph: ImpFile;
  layout: GraphLayout;
}

/** The stored form of a parsed query block. */
export function toStoredBlockData(data: TomeQueryBlockData): StoredQueryBlockData {
  return { version: data.version, graph: storedFromImpGraph(data.graph), layout: data.layout };
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

/** The default query block, parsed. */
export function defaultQueryBlock(): TomeQueryBlockData {
  return {
    version: QUERY_BLOCK_VERSION,
    graph: defaultImpGraph(),
    layout: defaultLayout(),
  };
}

/** The default query block as stored (inserted into new pages). */
export function defaultBlockData(): StoredQueryBlockData {
  return toStoredBlockData(defaultQueryBlock());
}

export function parseQueryBlockData(raw: unknown): TomeQueryBlockData {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return defaultQueryBlock();
  }
  const record = raw as Record<string, unknown>;

  const graph = impGraphFromStored(record.graph);
  if (graph) {
    return {
      version: QUERY_BLOCK_VERSION,
      graph,
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

  return defaultQueryBlock();
}
