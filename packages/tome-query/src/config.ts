import type { ReactFlowGraph } from "imp-react-flow";
import { impToReactFlow } from "imp-react-flow";
import type { Graph } from "imp-core-types";

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

/**
 * Keep the last inbound edge per (target, targetHandle).
 * Legacy/multi-wire graphs heal for compile/display instead of failing Imp SQL's at-most-one rule.
 * Last wins so a newer wire replaces a stale default (e.g. leftover input→output).
 */
export function dedupeInboundReactFlowEdges(
  edges: ReactFlowGraph["edges"],
): ReactFlowGraph["edges"] {
  const byTarget = new Map<string, ReactFlowGraph["edges"][number]>();
  for (const edge of edges) {
    const key = `${edge.target}\0${edge.targetHandle ?? ""}`;
    byTarget.set(key, edge);
  }
  const kept = new Set(byTarget.values());
  return edges.filter((edge) => kept.has(edge));
}

/** Drop existing edges that target the same input port (for replace-on-connect). */
export function withoutInboundToPort<T extends { target: string; targetHandle?: string | null }>(
  edges: T[],
  target: string,
  targetHandle: string | null | undefined,
): T[] {
  const handle = targetHandle ?? "";
  return edges.filter(
    (edge) => !(edge.target === target && (edge.targetHandle ?? "") === handle),
  );
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
      edges: dedupeInboundReactFlowEdges(rf.edges as ReactFlowGraph["edges"]),
    },
  };
}
