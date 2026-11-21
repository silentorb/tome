import type { Graph } from "imp-core-types";
import { layoutForImpGraph, type GraphLayout } from "tome-imp-view/layout";
import { NODE_FILTER_BLOCK_ROLE } from "tome-interfaces/page-block";
import type { Predicate } from "tome-ontology";

export const IMPLEMENTATION_ID = "tome-ontology-ui";
export const COMPONENT_ID = "tome-ontology-ui";
/** @deprecated In-body node-filter page blocks removed; Imp filters are node properties. */
export const BLOCK_ROLE = NODE_FILTER_BLOCK_ROLE;
/** Node property key for predicate selection Imp graphs. */
export const PREDICATE_PROPERTY_ID = "predicate";

/**
 * Fence body shape — same Imp graph stored on {@link Predicate.nodeFilter}.
 * Canonical on disk; layout is editor session / optional companion state.
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

export function defaultBlockData(): NodeFilterBlockData {
  return defaultNodeFilterImpGraph() as NodeFilterBlockData;
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
  const graph = coerceImpGraph(raw);
  return graph ?? defaultBlockData();
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

function coerceImpGraph(data: unknown): NodeFilterBlockData | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const obj = data as Record<string, unknown>;
  if (!obj.nodes || typeof obj.nodes !== "object" || Array.isArray(obj.nodes)) return null;
  if (!obj.edges || typeof obj.edges !== "object" || Array.isArray(obj.edges)) return null;

  const nodes: NodeFilterBlockData["nodes"] = {};
  for (const [id, rawNode] of Object.entries(obj.nodes as Record<string, unknown>)) {
    if (!rawNode || typeof rawNode !== "object" || Array.isArray(rawNode)) return null;
    const n = rawNode as Record<string, unknown>;
    if (typeof n.id !== "string" || typeof n.type !== "string") return null;
    if (!n.inputs || typeof n.inputs !== "object" || Array.isArray(n.inputs)) return null;
    const inputs: NodeFilterBlockData["nodes"][string]["inputs"] = {};
    for (const [port, value] of Object.entries(n.inputs as Record<string, unknown>)) {
      if (
        value !== null &&
        typeof value !== "string" &&
        typeof value !== "number" &&
        typeof value !== "boolean"
      ) {
        return null;
      }
      inputs[port] = value as string | number | boolean | null;
    }
    nodes[id] = { id: n.id, type: n.type, inputs };
  }

  const edges: NodeFilterBlockData["edges"] = {};
  for (const [id, rawEdge] of Object.entries(obj.edges as Record<string, unknown>)) {
    if (!rawEdge || typeof rawEdge !== "object" || Array.isArray(rawEdge)) return null;
    const e = rawEdge as Record<string, unknown>;
    const from = e.from;
    const to = e.to;
    if (!from || typeof from !== "object" || Array.isArray(from)) return null;
    if (!to || typeof to !== "object" || Array.isArray(to)) return null;
    const f = from as Record<string, unknown>;
    const t = to as Record<string, unknown>;
    if (typeof f.node !== "string" || typeof f.port !== "string") return null;
    if (typeof t.node !== "string" || typeof t.port !== "string") return null;
    edges[id] = {
      from: { node: f.node, port: f.port },
      to: { node: t.node, port: t.port },
    };
  }

  return { nodes, edges };
}
