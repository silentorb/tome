import { useCallback, useEffect, useState } from "react";
import type { Graph } from "imp-core-types";
import { createTomeImpRegistry } from "tome-imp-sql";
import type { EditorPageBlockHost } from "tome-interfaces/page-block/editor";
import type { GraphLayout } from "tome-imp-view/layout";
import { TomeImpView } from "tome-imp-view/editor";
import {
  BLOCK_ROLE,
  COMPONENT_ID,
  IMPLEMENTATION_ID,
  defaultBlockData,
  defaultNodeFilterLayout,
  parseNodeFilterBlockData,
  summarizeNodeFilter,
  type NodeFilterBlockData,
} from "./config";
import "./ontology-ui-block.css";

export function NodeFilterToolPanelContent({
  graph,
  layout,
  readOnly,
  onGraphChange,
  onLayoutChange,
}: {
  graph: Graph;
  layout: GraphLayout;
  readOnly?: boolean;
  onGraphChange: (graph: Graph) => void;
  onLayoutChange: (layout: GraphLayout) => void;
}) {
  return (
    <div className="tome-ontology-ui-tool-panel">
      <TomeImpView
        graph={graph}
        layout={layout}
        readOnly={readOnly}
        onGraphChange={onGraphChange}
        onLayoutChange={onLayoutChange}
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
  const [layout, setLayout] = useState<GraphLayout>(() =>
    defaultNodeFilterLayout(parseNodeFilterBlockData(blockData) as Graph),
  );

  useEffect(() => {
    const next = parseNodeFilterBlockData(blockData);
    setImpGraph(next);
    setLayout(defaultNodeFilterLayout(next as Graph));
  }, [blockData]);

  const persistGraph = useCallback(
    (next: Graph) => {
      const asFilter = next as NodeFilterBlockData;
      setImpGraph(asFilter);
      onBlockDataChange(asFilter);
    },
    [onBlockDataChange],
  );

  const openEditor = () => {
    if (!ctx.openToolPanel) return;
    ctx.openToolPanel({
      title: "Edit node filter",
      Component: NodeFilterToolPanelContent as (props: Record<string, unknown>) => unknown,
      props: {
        graph: impGraph as Graph,
        layout,
        readOnly,
        onGraphChange: persistGraph,
        onLayoutChange: setLayout,
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
    /** Edit Imp filters as property page sections (data nature `imp_graph`). */
    propertyColumnTypes: ["imp_graph"],
    insertDefaultData: () => defaultBlockData(),
    Component: NodeFilterBlockComponent,
  });
}

export { BLOCK_ROLE, COMPONENT_ID, IMPLEMENTATION_ID };
