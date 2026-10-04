import { useCallback, useEffect, useState } from "react";
import type { ReactFlowGraph } from "imp-react-flow";
import { createTomeImpRegistry } from "tome-imp-sql";
import type { EditorPageBlockHost } from "tome-interfaces/page-block/editor";
import { ImpFlowEditor } from "tome-react-flow/editor";
import {
  BLOCK_ROLE,
  COMPONENT_ID,
  IMPLEMENTATION_ID,
  defaultBlockData,
  nodeFilterToReactFlow,
  parseNodeFilterBlockData,
  reactFlowToNodeFilter,
  summarizeNodeFilter,
  type NodeFilterBlockData,
} from "./config";
import "./ontology-ui-block.css";

export function NodeFilterToolPanelContent({
  graph,
  readOnly,
  onGraphChange,
}: {
  graph: ReactFlowGraph;
  readOnly?: boolean;
  onGraphChange: (graph: ReactFlowGraph) => void;
}) {
  return (
    <div className="tome-ontology-ui-tool-panel">
      <ImpFlowEditor
        graph={graph}
        readOnly={readOnly}
        onGraphChange={onGraphChange}
        createRegistry={createTomeImpRegistry}
      />
    </div>
  );
}

export function NodeFilterBlockComponent({
  ctx,
  blockData,
  onBlockDataChange,
  readOnly,
}: {
  ctx: {
    component: { id: string; label: string };
    nodeId: string;
    openToolPanel?: (session: {
      title: string;
      Component: (props: Record<string, unknown>) => unknown;
      props: Record<string, unknown>;
      onClose?: () => void;
    }) => void;
    closeToolPanel?: () => void;
  };
  blockData: unknown;
  onBlockDataChange: (data: unknown) => void;
  readOnly?: boolean;
}) {
  const [impGraph, setImpGraph] = useState<NodeFilterBlockData>(() =>
    parseNodeFilterBlockData(blockData),
  );
  const [rfGraph, setRfGraph] = useState<ReactFlowGraph>(() =>
    nodeFilterToReactFlow(parseNodeFilterBlockData(blockData)),
  );

  useEffect(() => {
    const next = parseNodeFilterBlockData(blockData);
    setImpGraph(next);
    setRfGraph(nodeFilterToReactFlow(next));
  }, [blockData]);

  const persistReactFlow = useCallback(
    (next: ReactFlowGraph) => {
      setRfGraph(next);
      const imp = reactFlowToNodeFilter(next);
      setImpGraph(imp);
      onBlockDataChange(imp);
    },
    [onBlockDataChange],
  );

  const openEditor = () => {
    if (!ctx.openToolPanel) return;
    ctx.openToolPanel({
      title: "Edit node filter",
      Component: NodeFilterToolPanelContent as (props: Record<string, unknown>) => unknown,
      props: {
        graph: rfGraph,
        readOnly,
        onGraphChange: persistReactFlow,
      },
    });
  };

  return (
    <div className="tome-ontology-ui-block" data-component-id={ctx.component.id}>
      <div className="tome-ontology-ui-toolbar">
        <strong>{ctx.component.label}</strong>
        <button
          type="button"
          className="tome-ontology-ui-edit"
          disabled={readOnly || !ctx.openToolPanel}
          onClick={openEditor}
        >
          Edit filter
        </button>
      </div>
      <p className="tome-ontology-ui-summary">{summarizeNodeFilter(impGraph)}</p>
    </div>
  );
}

export function register(host: EditorPageBlockHost): void {
  host.registerPageBlock({
    implementationId: IMPLEMENTATION_ID,
    interactive: true,
    slashMenu: { label: "Node filter", group: "custom", order: 55 },
    insertDefaultData: () => defaultBlockData(),
    Component: NodeFilterBlockComponent,
  });
}

export { BLOCK_ROLE, COMPONENT_ID, IMPLEMENTATION_ID };
