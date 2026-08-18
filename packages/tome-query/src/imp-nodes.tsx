import { useMemo } from "react";
import {
  Handle,
  Position,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import type { InputValues, NodeType, PrimitiveValue } from "imp-spec";
import { getNodeType, listNodeTypes } from "imp-registry";
import { createQueryRegistry } from "./execute";

export type ImpFlowNodeData = {
  inputValues: InputValues;
  /** Target handle ids that currently have an inbound edge. */
  connectedInputPorts?: string[];
  onInputChange?: (nodeId: string, portId: string, value: PrimitiveValue) => void;
};

export type ImpFlowNode = Node<ImpFlowNodeData>;

/** Literal text fields only for scalar ports with no inbound edge. */
export function shouldShowPortLiteralInput(
  port: { id: string; type: { id: string } },
  connectedInputPorts: readonly string[] = [],
): boolean {
  const signal = port.type.id;
  if (signal === "collection" || signal === "boolean") return false;
  return !connectedInputPorts.includes(port.id);
}

function ImpOperatorNode({ id, data, type }: NodeProps<ImpFlowNode>) {
  const registry = useMemo(() => createQueryRegistry(), []);
  const nodeType = type ? getNodeType(registry, type) : undefined;
  const inputValues = data.inputValues ?? {};
  const connectedInputPorts = data.connectedInputPorts ?? [];

  if (!nodeType) {
    return (
      <div className="tome-query-rf-node tome-query-rf-node-unknown">
        <strong>{type ?? "unknown"}</strong>
      </div>
    );
  }

  const inputPorts = Object.values(nodeType.inputs);
  const outputPorts = Object.values(nodeType.outputs);

  return (
    <div className={`tome-query-rf-node tome-query-rf-node-${nodeType.id}`}>
      <div className="tome-query-rf-node-title">{nodeType.id}</div>
      {inputPorts.map((port) => (
        <div key={`in-${port.id}`} className="tome-query-rf-port tome-query-rf-port-in">
          <Handle
            type="target"
            position={Position.Left}
            id={port.id}
            className="tome-query-rf-handle"
          />
          <span className="tome-query-rf-port-label">{port.id}</span>
          {shouldShowPortLiteralInput(port, connectedInputPorts) ? (
            <input
              className="tome-query-rf-port-input nodrag"
              value={formatInputValue(inputValues[port.id])}
              onChange={(event) => {
                data.onInputChange?.(id, port.id, parseInputValue(event.target.value, port.id));
              }}
            />
          ) : null}
        </div>
      ))}
      {outputPorts.map((port) => (
        <div key={`out-${port.id}`} className="tome-query-rf-port tome-query-rf-port-out">
          <span className="tome-query-rf-port-label">{port.id}</span>
          <Handle
            type="source"
            position={Position.Right}
            id={port.id}
            className="tome-query-rf-handle"
          />
        </div>
      ))}
    </div>
  );
}

function formatInputValue(value: PrimitiveValue | undefined): string {
  if (value === undefined || value === null) return "";
  return String(value);
}

function parseInputValue(raw: string, portId: string): PrimitiveValue {
  if (portId === "count" || portId === "direction") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "null") return null;
  const asNumber = Number(raw);
  if (raw.trim() !== "" && Number.isFinite(asNumber) && String(asNumber) === raw.trim()) {
    return asNumber;
  }
  return raw;
}

export function createImpNodeTypes(): Record<string, typeof ImpOperatorNode> {
  const registry = createQueryRegistry();
  const types: Record<string, typeof ImpOperatorNode> = {};
  for (const nodeType of listNodeTypes(registry)) {
    types[nodeType.id] = ImpOperatorNode;
  }
  return types;
}

export function listPaletteNodeTypes(): NodeType[] {
  return listNodeTypes(createQueryRegistry()).filter(
    (type) => type.id !== "input" && type.id !== "output",
  );
}

export function useImpNodeTypes(): Record<string, typeof ImpOperatorNode> {
  return useMemo(() => createImpNodeTypes(), []);
}

export function newOperatorNodeId(typeId: string): string {
  return `${typeId}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createOperatorNode(
  typeId: string,
  position: { x: number; y: number },
  onInputChange: ImpFlowNodeData["onInputChange"],
): ImpFlowNode {
  const registry = createQueryRegistry();
  const nodeType = getNodeType(registry, typeId);
  const inputValues: InputValues = {};
  if (nodeType) {
    for (const port of Object.values(nodeType.inputs)) {
      if (port.defaultValue !== undefined) {
        inputValues[port.id] = port.defaultValue;
      }
    }
  }
  return {
    id: newOperatorNodeId(typeId),
    type: typeId,
    position,
    data: { inputValues, onInputChange },
  };
}
