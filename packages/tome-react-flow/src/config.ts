import type { ReactFlowGraph } from "imp-react-flow";

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
