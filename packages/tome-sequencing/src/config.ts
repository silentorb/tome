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
import { defaultImpGraph as defaultQueryImpGraph } from "tome-query/config";

export const SEQUENCING_BLOCK_VERSION = 1;
export const IMPLEMENTATION_ID = "tome-sequencing";
export const COMPONENT_ID = "tome-sequencing";
/** Fence `type=` role resolved via component `roles`. */
export const BLOCK_ROLE = "tome-sequencing";

/** Sentinel replaced with the host page node id at execute time. */
export const PAGE_NODE_ID_LITERAL = "$pageNodeId";

/** Parsed (in-memory) sequencing block. */
export interface SequencingBlockData {
  version: typeof SEQUENCING_BLOCK_VERSION;
  graph: Graph;
  layout: GraphLayout;
}

/** Sequencing block as stored in a page fence: the graph is a topology-only Imp file. */
export interface StoredSequencingBlockData {
  version: typeof SEQUENCING_BLOCK_VERSION;
  graph: ImpFile;
  layout: GraphLayout;
}

/** The stored form of a parsed sequencing block. */
export function toStoredBlockData(data: SequencingBlockData): StoredSequencingBlockData {
  return { version: data.version, graph: storedFromImpGraph(data.graph), layout: data.layout };
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

/** The default sequencing block, parsed. */
export function defaultSequencingBlock(): SequencingBlockData {
  return {
    version: SEQUENCING_BLOCK_VERSION,
    graph: defaultPageScopedImpGraph(),
    layout: defaultLayout(),
  };
}

/** The default sequencing block as stored (inserted into new pages). */
export function defaultBlockData(): StoredSequencingBlockData {
  return toStoredBlockData(defaultSequencingBlock());
}

export function parseSequencingBlockData(raw: unknown): SequencingBlockData {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return defaultSequencingBlock();
  }
  const record = raw as Record<string, unknown>;

  const graph = impGraphFromStored(record.graph);
  if (graph) {
    return {
      version: SEQUENCING_BLOCK_VERSION,
      graph,
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

  return defaultSequencingBlock();
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
