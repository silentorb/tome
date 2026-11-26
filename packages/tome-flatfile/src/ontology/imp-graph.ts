import type { ImpGraph } from "tome-graph-interfaces";

type ImpNode = ImpGraph["nodes"][string];
type ImpEdge = ImpGraph["edges"][string];

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseNode(raw: unknown): ImpNode | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.id !== "string" || typeof raw.type !== "string") return null;
  if (!isRecord(raw.inputs)) return null;
  const inputs: ImpNode["inputs"] = {};
  for (const [port, value] of Object.entries(raw.inputs)) {
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
  return { id: raw.id, type: raw.type, inputs };
}

function parsePortReference(raw: unknown): { node: string; port: string } | null {
  if (!isRecord(raw) || typeof raw.node !== "string" || typeof raw.port !== "string") return null;
  return { node: raw.node, port: raw.port };
}

/**
 * Validate a stored Imp value — an Imp file holding only `nodes` / `edges` arrays (see imp-spec
 * `imp-files.md`) — and return it as an in-memory Imp graph (id-keyed maps). Returns `null` for
 * anything else, including files that carry `types` or `definitions`.
 */
export function parseImpGraph(data: unknown): ImpGraph | null {
  if (!isRecord(data)) return null;
  if (data.format !== undefined && data.format !== "imp") return null;
  for (const section of ["types", "definitions"]) {
    const value = data[section];
    if (value !== undefined && (!Array.isArray(value) || value.length > 0)) return null;
  }
  const rawNodes = data.nodes ?? [];
  const rawEdges = data.edges ?? [];
  if (!Array.isArray(rawNodes) || !Array.isArray(rawEdges)) return null;

  const nodes: ImpGraph["nodes"] = {};
  for (const raw of rawNodes) {
    const node = parseNode(raw);
    if (!node || node.id in nodes) return null;
    nodes[node.id] = node;
  }

  const edges: ImpGraph["edges"] = {};
  for (const raw of rawEdges) {
    if (!isRecord(raw) || typeof raw.id !== "string" || raw.id in edges) return null;
    const from = parsePortReference(raw.from);
    const to = parsePortReference(raw.to);
    if (!from || !to) return null;
    const edge: ImpEdge = { from, to };
    edges[raw.id] = edge;
  }

  return { nodes, edges };
}
