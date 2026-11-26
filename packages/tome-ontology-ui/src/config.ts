import type { Graph } from "imp-core-types";
import type { ImpFile } from "imp-core-types";
import {
  impGraphFromStored,
  layoutForImpGraph,
  storedFromImpGraph,
  type GraphLayout,
} from "tome-imp-view/layout";
import { NODE_FILTER_BLOCK_ROLE } from "tome-interfaces/page-block";
import type { Predicate } from "tome-ontology";

export const IMPLEMENTATION_ID = "tome-ontology-ui";
export const COMPONENT_ID = "tome-ontology-ui";
/** @deprecated In-body node-filter page blocks removed; Imp filters are node properties. */
export const BLOCK_ROLE = NODE_FILTER_BLOCK_ROLE;
/** Node property key for predicate selection Imp graphs. */
export const PREDICATE_PROPERTY_ID = "predicate";

/**
 * Parsed node filter — the in-memory Imp graph on {@link Predicate.nodeFilter}. On disk the
 * property holds a topology-only Imp file ({@link defaultBlockData}); layout is editor session state.
 */
export type NodeFilterBlockData = NonNullable<Predicate["nodeFilter"]>;

/** Default Imp filter: constant `true` (matches ontology runtime test fixtures). */
export function defaultNodeFilterImpGraph(): Graph {
  return {
    nodes: {
      lit: { id: "lit", type: "literal", inputs: { value: true } },
    },
    edges: {},
  };
}

/** The default node filter as stored (a topology-only Imp file). */
export function defaultBlockData(): ImpFile {
  return storedFromImpGraph(defaultNodeFilterImpGraph());
}

export function defaultNodeFilterLayout(graph: Graph = defaultNodeFilterImpGraph()): GraphLayout {
  const positions: Record<string, { x: number; y: number }> = {};
  let index = 0;
  for (const id of Object.keys(graph.nodes)) {
    positions[id] = { x: 80 + index * 200, y: 120 };
    index += 1;
  }
  return layoutForImpGraph(graph, positions);
}

export function parseNodeFilterBlockData(raw: unknown): NodeFilterBlockData {
  const graph = impGraphFromStored(raw) ?? defaultNodeFilterImpGraph();
  return graph as NodeFilterBlockData;
}

export function summarizeNodeFilter(graph: NodeFilterBlockData): string {
  const nodeCount = Object.keys(graph.nodes).length;
  const edgeCount = Object.keys(graph.edges).length;
  const types = [...new Set(Object.values(graph.nodes).map((n) => n.type))];
  const typeLabel = types.length <= 3 ? types.join(", ") : `${types.slice(0, 3).join(", ")}…`;
  return `${nodeCount} operator${nodeCount === 1 ? "" : "s"}, ${edgeCount} edge${edgeCount === 1 ? "" : "s"}${
    typeLabel ? ` (${typeLabel})` : ""
  }`;
}

