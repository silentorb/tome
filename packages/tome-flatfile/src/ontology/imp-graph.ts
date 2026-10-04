import type { ImpGraph } from "tome-graph-interfaces";

/** Validate / coerce unknown JSON into an Imp graph shape (nodes + edges records). */
export function parseImpGraph(data: unknown): ImpGraph | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const obj = data as Record<string, unknown>;
  if (!obj.nodes || typeof obj.nodes !== "object" || Array.isArray(obj.nodes)) return null;
  if (!obj.edges || typeof obj.edges !== "object" || Array.isArray(obj.edges)) return null;

  const nodes: ImpGraph["nodes"] = {};
  for (const [id, rawNode] of Object.entries(obj.nodes as Record<string, unknown>)) {
    if (!rawNode || typeof rawNode !== "object" || Array.isArray(rawNode)) return null;
    const n = rawNode as Record<string, unknown>;
    if (typeof n.id !== "string" || typeof n.type !== "string") return null;
    if (!n.inputs || typeof n.inputs !== "object" || Array.isArray(n.inputs)) return null;
    const inputs: ImpGraph["nodes"][string]["inputs"] = {};
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

  const edges: ImpGraph["edges"] = {};
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
