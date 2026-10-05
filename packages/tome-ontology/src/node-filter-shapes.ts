import type { ImpGraph } from "tome-graph-interfaces";
import { projectionTypeForEndpoint } from "./endpoints";

/** Imp node type recognized by Tome's node-filter evaluator (not Imp catalog). */
export const HOSTS_PROJECTION_NODE_TYPE = "hosts_projection";

export interface HostsProjectionSpec {
  relationshipTypeId: string;
  direction: 0 | 1;
}

function literalValue(graph: ImpGraph, nodeId: string): string | number | boolean | null | undefined {
  const node = graph.nodes[nodeId];
  if (!node || node.type !== "literal") return undefined;
  return node.inputs.value as string | number | boolean | null | undefined;
}

function inboundSource(
  graph: ImpGraph,
  toNode: string,
  toPort: string,
): string | undefined {
  for (const edge of Object.values(graph.edges)) {
    if (edge.to.node === toNode && edge.to.port === toPort) {
      return edge.from.node;
    }
  }
  return undefined;
}

/**
 * Detect a hosts_projection node-filter:
 * a `hosts_projection` node with association + direction literals wired in
 * (or set as inputs).
 */
export function parseHostsProjectionFilter(graph: ImpGraph): HostsProjectionSpec | null {
  const hosts = Object.values(graph.nodes).find((n) => n.type === HOSTS_PROJECTION_NODE_TYPE);
  if (!hosts) return null;

  let relationshipTypeId: string | undefined;
  let direction: 0 | 1 | undefined;

  const assocFromInput = hosts.inputs.association;
  const dirFromInput = hosts.inputs.direction;
  if (typeof assocFromInput === "string" && assocFromInput.trim()) {
    relationshipTypeId = assocFromInput.trim();
  }
  if (dirFromInput === 0 || dirFromInput === 1) {
    direction = dirFromInput;
  } else if (dirFromInput === "0" || dirFromInput === "1") {
    direction = Number(dirFromInput) as 0 | 1;
  }

  const assocSrc = inboundSource(graph, hosts.id, "association");
  if (assocSrc && relationshipTypeId === undefined) {
    const v = literalValue(graph, assocSrc);
    if (typeof v === "string" && v.trim()) relationshipTypeId = v.trim();
  }
  const dirSrc = inboundSource(graph, hosts.id, "direction");
  if (dirSrc && direction === undefined) {
    const v = literalValue(graph, dirSrc);
    if (v === 0 || v === 1) direction = v;
    else if (v === "0" || v === "1") direction = Number(v) as 0 | 1;
  }

  if (!relationshipTypeId || (direction !== 0 && direction !== 1)) return null;
  return { relationshipTypeId, direction };
}

export function hostsProjectionType(spec: HostsProjectionSpec): string {
  return projectionTypeForEndpoint(spec.relationshipTypeId, spec.direction);
}

/** True when the filter is only a boolean literal (no other operators). */
export function parseLiteralBooleanFilter(graph: ImpGraph): boolean | null {
  const nodes = Object.values(graph.nodes);
  if (nodes.length !== 1) return null;
  const only = nodes[0]!;
  if (only.type !== "literal") return null;
  if (Object.keys(graph.edges).length > 0) return null;
  return only.inputs.value === true ? true : only.inputs.value === false ? false : null;
}

/** Build a hosts_projection Imp graph for seeding / tests. */
export function hostsProjectionFilterGraph(
  relationshipTypeId: string,
  direction: 0 | 1,
): ImpGraph {
  return {
    nodes: {
      association: {
        id: "association",
        type: "literal",
        inputs: { value: relationshipTypeId },
      },
      direction: {
        id: "direction",
        type: "literal",
        inputs: { value: direction },
      },
      hosts: { id: "hosts", type: HOSTS_PROJECTION_NODE_TYPE, inputs: {} },
    },
    edges: {
      e1: {
        from: { node: "association", port: "value" },
        to: { node: "hosts", port: "association" },
      },
      e2: {
        from: { node: "direction", port: "value" },
        to: { node: "hosts", port: "direction" },
      },
    },
  };
}
