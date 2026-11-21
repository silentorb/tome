import type { Graph } from "imp-core-types";
import {
  dedupeInboundReactFlowEdges,
  impToReactFlow,
  reactFlowToImp,
  type LayoutBox,
  type ReactFlowGraph,
} from "imp-graph-view";

/** Host layout map keyed by Imp node id (positions for ImpGraphView). */
export type GraphLayout = Record<string, LayoutBox>;

export function emptyLayout(): GraphLayout {
  return {};
}

/** Extract positions from a legacy React Flow envelope. */
export function layoutFromReactFlow(reactFlow: ReactFlowGraph): GraphLayout {
  const layout: GraphLayout = {};
  for (const node of reactFlow.nodes) {
    layout[node.id] = {
      x: node.position?.x ?? 0,
      y: node.position?.y ?? 0,
    };
  }
  return layout;
}

/** Convert a legacy RF envelope to Imp Graph + layout (dedupes inbound edges). */
export function reactFlowToImpAndLayout(reactFlow: ReactFlowGraph): {
  graph: Graph;
  layout: GraphLayout;
} {
  const edges = dedupeInboundReactFlowEdges(reactFlow.edges);
  return {
    graph: reactFlowToImp(reactFlow.nodes, edges),
    layout: layoutFromReactFlow({ ...reactFlow, edges }),
  };
}

/** Build a default layout by placing converter defaults (0,0) then applying overrides. */
export function layoutForImpGraph(
  graph: Graph,
  positions: Record<string, { x: number; y: number }>,
): GraphLayout {
  const rf = impToReactFlow(graph);
  const layout = layoutFromReactFlow(rf);
  for (const [id, pos] of Object.entries(positions)) {
    layout[id] = { x: pos.x, y: pos.y };
  }
  return layout;
}

export function isReactFlowEnvelope(value: unknown): value is ReactFlowGraph {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Array.isArray(record.nodes) && Array.isArray(record.edges);
}

export function isImpGraph(value: unknown): value is Graph {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (!record.nodes || typeof record.nodes !== "object" || Array.isArray(record.nodes)) {
    return false;
  }
  if (!record.edges || typeof record.edges !== "object" || Array.isArray(record.edges)) {
    return false;
  }
  return true;
}

export function parseLayout(raw: unknown): GraphLayout {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return emptyLayout();
  const layout: GraphLayout = {};
  for (const [id, box] of Object.entries(raw as Record<string, unknown>)) {
    if (!box || typeof box !== "object" || Array.isArray(box)) continue;
    const record = box as Record<string, unknown>;
    const x = typeof record.x === "number" ? record.x : 0;
    const y = typeof record.y === "number" ? record.y : 0;
    const entry: LayoutBox = { x, y };
    if (typeof record.width === "number") entry.width = record.width;
    if (typeof record.height === "number") entry.height = record.height;
    layout[id] = entry;
  }
  return layout;
}
