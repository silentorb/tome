import type { Graph, PrimitiveValue } from "imp-core-types";

export type GraphParameterValue = string | number | boolean | null;

export interface GraphParameterSpec {
  id: string;
  label: string;
  defaultValue: GraphParameterValue;
}

function isParameterValue(value: unknown): value is GraphParameterValue {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

/** Discover Imp `parameter` nodes in a graph. */
export function listGraphParameters(graph: Graph): GraphParameterSpec[] {
  const params: GraphParameterSpec[] = [];
  for (const node of Object.values(graph.nodes)) {
    if (node.type !== "parameter") continue;
    const values = node.inputs ?? {};
    const labelRaw = values.label;
    const label =
      typeof labelRaw === "string" && labelRaw.trim() ? labelRaw.trim() : node.id;
    const defaultRaw = values.value;
    const defaultValue = isParameterValue(defaultRaw) ? defaultRaw : null;
    params.push({ id: node.id, label, defaultValue });
  }
  return params;
}

/** Effective values: user overrides layered on graph defaults. */
export function resolveGraphParameterValues(
  graph: Graph,
  overrides: Record<string, GraphParameterValue> | undefined,
): Record<string, GraphParameterValue> {
  const resolved: Record<string, GraphParameterValue> = {};
  for (const param of listGraphParameters(graph)) {
    if (overrides && Object.prototype.hasOwnProperty.call(overrides, param.id)) {
      const raw = overrides[param.id];
      resolved[param.id] = isParameterValue(raw) ? raw : param.defaultValue;
    } else {
      resolved[param.id] = param.defaultValue;
    }
  }
  return resolved;
}

/** Write resolved parameter values into parameter node inputs.value. */
export function bindGraphParameters(
  graph: Graph,
  values: Record<string, GraphParameterValue>,
): Graph {
  let changed = false;
  const nodes: Graph["nodes"] = { ...graph.nodes };
  for (const [id, node] of Object.entries(graph.nodes)) {
    if (node.type !== "parameter") continue;
    if (!Object.prototype.hasOwnProperty.call(values, id)) continue;
    const nextValue = values[id] as PrimitiveValue;
    if (node.inputs?.value === nextValue) continue;
    changed = true;
    nodes[id] = {
      ...node,
      inputs: {
        ...node.inputs,
        value: nextValue,
      },
    };
  }
  if (!changed) return graph;
  return { ...graph, nodes };
}
