import type { PrimitiveValue } from "imp-core-types";
import type { ReactFlowGraph } from "imp-react-flow";

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

/** Discover Imp `parameter` nodes in a React Flow graph. */
export function listGraphParameters(reactFlow: ReactFlowGraph): GraphParameterSpec[] {
  const params: GraphParameterSpec[] = [];
  for (const node of reactFlow.nodes) {
    if (node.type !== "parameter") continue;
    const values = node.data?.inputValues ?? {};
    const labelRaw = values.label;
    const label =
      typeof labelRaw === "string" && labelRaw.trim()
        ? labelRaw.trim()
        : node.id;
    const defaultRaw = values.value;
    const defaultValue = isParameterValue(defaultRaw) ? defaultRaw : null;
    params.push({ id: node.id, label, defaultValue });
  }
  return params;
}

/** Effective values: user overrides layered on graph defaults. */
export function resolveGraphParameterValues(
  reactFlow: ReactFlowGraph,
  overrides: Record<string, GraphParameterValue> | undefined,
): Record<string, GraphParameterValue> {
  const resolved: Record<string, GraphParameterValue> = {};
  for (const param of listGraphParameters(reactFlow)) {
    if (overrides && Object.prototype.hasOwnProperty.call(overrides, param.id)) {
      const raw = overrides[param.id];
      resolved[param.id] = isParameterValue(raw) ? raw : param.defaultValue;
    } else {
      resolved[param.id] = param.defaultValue;
    }
  }
  return resolved;
}

/** Write resolved parameter values into RF parameter node inputValues.value. */
export function bindGraphParameters(
  reactFlow: ReactFlowGraph,
  values: Record<string, GraphParameterValue>,
): ReactFlowGraph {
  let changed = false;
  const nodes = reactFlow.nodes.map((node) => {
    if (node.type !== "parameter") return node;
    if (!Object.prototype.hasOwnProperty.call(values, node.id)) return node;
    const nextValue = values[node.id] as PrimitiveValue;
    const prev = node.data?.inputValues?.value;
    if (prev === nextValue) return node;
    changed = true;
    return {
      ...node,
      data: {
        ...node.data,
        inputValues: {
          ...(node.data?.inputValues ?? {}),
          value: nextValue,
        },
      },
    };
  });
  if (!changed) return reactFlow;
  return { nodes, edges: reactFlow.edges };
}
