import { useCallback, useMemo, useRef } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type NodeChange,
  type EdgeChange,
  applyNodeChanges,
  applyEdgeChanges,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { PrimitiveValue } from "imp-core-types";
import type { ReactFlowGraph } from "imp-react-flow";
import { withoutInboundToPort } from "./config";
import {
  createOperatorNode,
  listPaletteNodeTypes,
  useImpNodeTypes,
  type ImpFlowNode,
  type ImpFlowNodeData,
} from "./imp-nodes";
import type { PathHopOptions } from "./path-hop-options";
import { ImpFlowRegistryProvider, type CreateRegistry } from "./registry-context";
import "./imp-flow-css.css";

export interface ImpFlowEditorProps {
  graph: ReactFlowGraph;
  readOnly?: boolean;
  onGraphChange: (graph: ReactFlowGraph) => void;
  /** Imp NodeLibrary registry factory (required). */
  createRegistry: CreateRegistry;
  /** Ontology-backed traverse hop options (type + relation tokens). */
  pathHopOptions?: PathHopOptions | null;
}

/** React Flow deleteKeyCode: Backspace+Delete when editable; null when read-only. */
export function impFlowDeleteKeyCode(readOnly?: boolean): string[] | null {
  return readOnly ? null : ["Backspace", "Delete"];
}

export function ImpFlowEditor({
  graph,
  readOnly,
  onGraphChange,
  createRegistry,
  pathHopOptions = null,
}: ImpFlowEditorProps) {
  return (
    <ImpFlowRegistryProvider createRegistry={createRegistry}>
      <ImpFlowEditorInner
        graph={graph}
        readOnly={readOnly}
        onGraphChange={onGraphChange}
        createRegistry={createRegistry}
        pathHopOptions={pathHopOptions}
      />
    </ImpFlowRegistryProvider>
  );
}

function ImpFlowEditorInner({
  graph,
  readOnly,
  onGraphChange,
  createRegistry,
  pathHopOptions = null,
}: ImpFlowEditorProps) {
  const nodeTypes = useImpNodeTypes(createRegistry);
  const palette = useMemo(() => listPaletteNodeTypes(createRegistry), [createRegistry]);
  const onGraphChangeRef = useRef(onGraphChange);
  onGraphChangeRef.current = onGraphChange;

  const emit = useCallback((nextNodes: ImpFlowNode[], nextEdges: Edge[]) => {
    onGraphChangeRef.current({
      nodes: nextNodes.map(({ id, type, position, data }) => ({
        id,
        type,
        position,
        data: {
          inputValues: data.inputValues ?? {},
          ...(data.pathStartType ? { pathStartType: data.pathStartType } : {}),
        },
      })),
      edges: nextEdges.map(({ id, source, target, sourceHandle, targetHandle }) => ({
        id,
        source,
        target,
        sourceHandle: sourceHandle ?? undefined,
        targetHandle: targetHandle ?? undefined,
      })),
    });
  }, []);

  const onInputChange = useCallback(
    (nodeId: string, portId: string, value: PrimitiveValue) => {
      setNodes((current) => {
        const next = current.map((node) => {
          if (node.id !== nodeId) return node;
          return {
            ...node,
            data: {
              ...node.data,
              inputValues: {
                ...node.data.inputValues,
                [portId]: value,
              },
            },
          };
        });
        setEdges((currentEdges) => {
          emit(next, currentEdges);
          return currentEdges;
        });
        return next;
      });
    },
    [emit],
  );

  const onPathStartTypeChange = useCallback(
    (nodeId: string, typeId: string) => {
      setNodes((current) => {
        const next = current.map((node) => {
          if (node.id !== nodeId) return node;
          return {
            ...node,
            data: {
              ...node.data,
              pathStartType: typeId || undefined,
              inputValues: {
                ...node.data.inputValues,
                association: "",
                direction: 0,
              },
            },
          };
        });
        setEdges((currentEdges) => {
          emit(next, currentEdges);
          return currentEdges;
        });
        return next;
      });
    },
    [emit],
  );

  const [nodes, setNodes] = useNodesState(
    attachInputHandlers(
      graph.nodes as ImpFlowNode[],
      graph.edges as Edge[],
      onInputChange,
      onPathStartTypeChange,
      pathHopOptions,
    ),
  );
  const [edges, setEdges] = useEdgesState(graph.edges as Edge[]);

  // Keep handlers + connection flags fresh without resetting positions from parent.
  const nodesWithHandlers = useMemo(
    () =>
      attachInputHandlers(
        nodes,
        edges,
        onInputChange,
        onPathStartTypeChange,
        pathHopOptions,
      ),
    [nodes, edges, onInputChange, onPathStartTypeChange, pathHopOptions],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<ImpFlowNode>[]) => {
      if (readOnly) return;
      setNodes((current) => {
        const next = applyNodeChanges(changes, current);
        setEdges((currentEdges) => {
          emit(next, currentEdges);
          return currentEdges;
        });
        return next;
      });
    },
    [emit, readOnly, setNodes],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<Edge>[]) => {
      if (readOnly) return;
      setEdges((current) => {
        const next = applyEdgeChanges(changes, current);
        setNodes((currentNodes) => {
          emit(currentNodes, next);
          return currentNodes;
        });
        return next;
      });
    },
    [emit, readOnly, setEdges, setNodes],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (readOnly) return;
      if (!connection.target) return;
      setEdges((current) => {
        const cleared = withoutInboundToPort(
          current,
          connection.target!,
          connection.targetHandle,
        );
        const next = addEdge(
          {
            ...connection,
            id: `e_${connection.source}_${connection.target}_${connection.sourceHandle}_${connection.targetHandle}`,
          },
          cleared,
        );
        setNodes((currentNodes) => {
          emit(currentNodes, next);
          return currentNodes;
        });
        return next;
      });
    },
    [emit, readOnly, setEdges, setNodes],
  );

  const addNode = (typeId: string) => {
    if (readOnly) return;
    setNodes((current) => {
      const next = [
        ...current,
        createOperatorNode(
          createRegistry,
          typeId,
          { x: 160 + current.length * 24, y: 80 + current.length * 24 },
          onInputChange,
        ),
      ];
      setEdges((currentEdges) => {
        emit(next, currentEdges);
        return currentEdges;
      });
      return next;
    });
  };

  return (
    <div className="tome-rf-flow">
      {!readOnly ? (
        <div className="tome-rf-palette">
          {palette.map((type) => (
            <button
              key={type.id}
              type="button"
              className="tome-rf-palette-btn"
              onClick={() => addNode(type.id)}
            >
              {type.id}
            </button>
          ))}
        </div>
      ) : null}
      <div className="tome-rf-flow-canvas">
        <ReactFlow
          nodes={nodesWithHandlers}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          deleteKeyCode={impFlowDeleteKeyCode(readOnly)}
          nodesDraggable={!readOnly}
          nodesConnectable={!readOnly}
          elementsSelectable={!readOnly}
          fitView
        >
          <Background />
          <Controls />
          <MiniMap />
        </ReactFlow>
      </div>
    </div>
  );
}

function connectedInputPortsByNode(edges: Edge[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const edge of edges) {
    const handle = edge.targetHandle;
    if (!edge.target || !handle) continue;
    const list = map.get(edge.target) ?? [];
    if (!list.includes(handle)) list.push(handle);
    map.set(edge.target, list);
  }
  return map;
}

function attachInputHandlers(
  nodes: ImpFlowNode[],
  edges: Edge[],
  onInputChange: ImpFlowNodeData["onInputChange"],
  onPathStartTypeChange: ImpFlowNodeData["onPathStartTypeChange"],
  pathHopOptions: PathHopOptions | null,
): ImpFlowNode[] {
  const connected = connectedInputPortsByNode(edges);
  return nodes.map((node) => ({
    ...node,
    data: {
      inputValues: node.data?.inputValues ?? {},
      pathStartType:
        typeof node.data?.pathStartType === "string" ? node.data.pathStartType : undefined,
      connectedInputPorts: connected.get(node.id) ?? [],
      onInputChange,
      onPathStartTypeChange,
      pathHopOptions,
    },
  }));
}
