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
import type { PrimitiveValue } from "imp-spec";
import type { ReactFlowGraph } from "imp-react-flow";
import { withoutInboundToPort } from "./config";
import {
  createOperatorNode,
  listPaletteNodeTypes,
  useImpNodeTypes,
  type ImpFlowNode,
  type ImpFlowNodeData,
} from "./imp-nodes";

export interface QueryFlowEditorProps {
  graph: ReactFlowGraph;
  readOnly?: boolean;
  onGraphChange: (graph: ReactFlowGraph) => void;
}

export function QueryFlowEditor({ graph, readOnly, onGraphChange }: QueryFlowEditorProps) {
  const nodeTypes = useImpNodeTypes();
  const palette = useMemo(() => listPaletteNodeTypes(), []);
  const onGraphChangeRef = useRef(onGraphChange);
  onGraphChangeRef.current = onGraphChange;

  const emit = useCallback((nextNodes: ImpFlowNode[], nextEdges: Edge[]) => {
    onGraphChangeRef.current({
      nodes: nextNodes.map(({ id, type, position, data }) => ({
        id,
        type,
        position,
        data: { inputValues: data.inputValues ?? {} },
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

  const [nodes, setNodes] = useNodesState(
    attachInputHandlers(graph.nodes as ImpFlowNode[], onInputChange),
  );
  const [edges, setEdges] = useEdgesState(graph.edges as Edge[]);

  // Keep handlers fresh on nodes without resetting positions from parent on every keystroke.
  const nodesWithHandlers = useMemo(
    () => attachInputHandlers(nodes, onInputChange),
    [nodes, onInputChange],
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
    <div className="tome-query-flow">
      {!readOnly ? (
        <div className="tome-query-palette">
          {palette.map((type) => (
            <button
              key={type.id}
              type="button"
              className="tome-query-palette-btn"
              onClick={() => addNode(type.id)}
            >
              {type.id}
            </button>
          ))}
        </div>
      ) : null}
      <div className="tome-query-flow-canvas">
        <ReactFlow
          nodes={nodesWithHandlers}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          deleteKeyCode={readOnly ? null : ["Backspace", "Delete"]}
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

function attachInputHandlers(
  nodes: ImpFlowNode[],
  onInputChange: ImpFlowNodeData["onInputChange"],
): ImpFlowNode[] {
  return nodes.map((node) => ({
    ...node,
    data: {
      inputValues: node.data?.inputValues ?? {},
      onInputChange,
    },
  }));
}
