import { useMemo } from "react";
import {
  Handle,
  Position,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import type { InputValues, NodeDefinition, Port, PrimitiveValue } from "imp-core-types";
import { isConcreteSignalType } from "imp-core-types";
import { getNodeDefinition, listNodeDefinitions, type Registry } from "imp-registry";
import {
  matchPathHopRelation,
  type PathHopOptions,
} from "./path-hop-options";
import { useCreateRegistry, type CreateRegistry } from "./registry-context";

export type ImpFlowNodeData = {
  inputValues: InputValues;
  /** Target handle ids that currently have an inbound edge. */
  connectedInputPorts?: string[];
  /** Type-table id for ontology-backed traverse hops (UI only; not an Imp port). */
  pathStartType?: string;
  onInputChange?: (nodeId: string, portId: string, value: PrimitiveValue) => void;
  onPathStartTypeChange?: (nodeId: string, typeId: string) => void;
  pathHopOptions?: PathHopOptions | null;
};

export type ImpFlowNode = Node<ImpFlowNodeData>;

/** Literal text fields only for scalar ports with no inbound edge. */
export function shouldShowPortLiteralInput(
  port: Port,
  connectedInputPorts: readonly string[] = [],
): boolean {
  if (!isConcreteSignalType(port.type)) return false;
  const signal = port.type.id;
  if (signal === "collection" || signal === "boolean") return false;
  return !connectedInputPorts.includes(port.id);
}

function ImpOperatorNode({ id, data, type }: NodeProps<ImpFlowNode>) {
  const createRegistry = useCreateRegistry();
  const registry = useMemo(() => createRegistry(), [createRegistry]);
  const definition = type ? getNodeDefinition(registry, type) : undefined;
  const inputValues = data.inputValues ?? {};
  const connectedInputPorts = data.connectedInputPorts ?? [];
  const pathHopOptions = data.pathHopOptions ?? null;
  const isTraverse = type === "traverse";
  const useOntologyHops = isTraverse && pathHopOptions != null;

  if (!definition) {
    return (
      <div className="tome-rf-node tome-rf-node-unknown">
        <strong>{type ?? "unknown"}</strong>
      </div>
    );
  }

  const inputPorts = Object.values(definition.inputs);
  const outputPorts = Object.values(definition.outputs);

  const matched = useOntologyHops
    ? matchPathHopRelation(
        pathHopOptions,
        data.pathStartType,
        inputValues.association,
        inputValues.direction,
      )
    : null;

  return (
    <div className={`tome-rf-node tome-rf-node-${definition.id}`}>
      <div className="tome-rf-node-title">{definition.id}</div>
      {useOntologyHops ? (
        <div className="tome-rf-port tome-rf-port-in tome-rf-path-hop">
          <span className="tome-rf-port-label">type</span>
          <select
            className="tome-rf-port-input nodrag"
            value={data.pathStartType ?? ""}
            onChange={(event) => {
              data.onPathStartTypeChange?.(id, event.target.value);
            }}
          >
            <option value="">Select type…</option>
            {pathHopOptions.typeTables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
          <span className="tome-rf-port-label">relation</span>
          <select
            className="tome-rf-port-input nodrag"
            value={matched?.token ?? ""}
            disabled={!data.pathStartType}
            onChange={(event) => {
              const token = event.target.value;
              const list = pathHopOptions.relationsByType[data.pathStartType ?? ""] ?? [];
              const opt = list.find((o) => o.token === token);
              if (!opt) return;
              data.onInputChange?.(id, "association", opt.association);
              data.onInputChange?.(id, "direction", opt.direction);
            }}
          >
            <option value="">Select relation…</option>
            {(pathHopOptions.relationsByType[data.pathStartType ?? ""] ?? []).map((o) => (
              <option key={o.token} value={o.token}>
                {o.label} ({o.token})
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {inputPorts.map((port) => {
        if (
          useOntologyHops &&
          (port.id === "association" || port.id === "direction") &&
          !connectedInputPorts.includes(port.id)
        ) {
          return (
            <div key={`in-${port.id}`} className="tome-rf-port tome-rf-port-in">
              <Handle
                type="target"
                position={Position.Left}
                id={port.id}
                className="tome-rf-handle"
              />
              <span className="tome-rf-port-label">{port.id}</span>
            </div>
          );
        }
        return (
          <div key={`in-${port.id}`} className="tome-rf-port tome-rf-port-in">
            <Handle
              type="target"
              position={Position.Left}
              id={port.id}
              className="tome-rf-handle"
            />
            <span className="tome-rf-port-label">{port.id}</span>
            {shouldShowPortLiteralInput(port, connectedInputPorts) ? (
              <input
                className="tome-rf-port-input nodrag"
                value={formatInputValue(inputValues[port.id])}
                onChange={(event) => {
                  data.onInputChange?.(id, port.id, parseInputValue(event.target.value, port.id));
                }}
              />
            ) : null}
          </div>
        );
      })}
      {outputPorts.map((port) => (
        <div key={`out-${port.id}`} className="tome-rf-port tome-rf-port-out">
          <span className="tome-rf-port-label">{port.id}</span>
          <Handle
            type="source"
            position={Position.Right}
            id={port.id}
            className="tome-rf-handle"
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

export function createImpNodeTypes(registry: Registry): Record<string, typeof ImpOperatorNode> {
  const types: Record<string, typeof ImpOperatorNode> = {};
  for (const definition of listNodeDefinitions(registry)) {
    types[definition.id] = ImpOperatorNode;
  }
  return types;
}

export function listPaletteNodeTypes(createRegistry: CreateRegistry): NodeDefinition[] {
  return listNodeDefinitions(createRegistry()).filter(
    (type) => type.id !== "input" && type.id !== "output",
  );
}

export function useImpNodeTypes(createRegistry: CreateRegistry): Record<string, typeof ImpOperatorNode> {
  return useMemo(() => createImpNodeTypes(createRegistry()), [createRegistry]);
}

export function newOperatorNodeId(typeId: string): string {
  return `${typeId}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createOperatorNode(
  createRegistry: CreateRegistry,
  typeId: string,
  position: { x: number; y: number },
  onInputChange: ImpFlowNodeData["onInputChange"],
): ImpFlowNode {
  const registry = createRegistry();
  const definition = getNodeDefinition(registry, typeId);
  const inputValues: InputValues = {};
  if (definition) {
    for (const port of Object.values(definition.inputs)) {
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
