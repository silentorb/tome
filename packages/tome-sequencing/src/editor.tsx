import { useCallback, useEffect, useState } from "react";
import type { EditorPageBlockHost } from "tome-interfaces/page-block/editor";
import type { ReactFlowGraph } from "imp-react-flow";
import { QueryFlowEditor } from "tome-query/query-editor";
import {
  COMPONENT_ID,
  IMPLEMENTATION_ID,
  SEQUENCING_BLOCK_VERSION,
  defaultBlockData,
  parseSequencingBlockData,
  type SequencingBlockData,
} from "./config";
import { SequencingTimelineView } from "./timeline";
import type { TimelineLayout } from "./layout";
import "./sequencing-block.css";

function toBlockData(reactFlow: ReactFlowGraph): SequencingBlockData {
  return {
    version: SEQUENCING_BLOCK_VERSION,
    reactFlow,
  };
}

export function SequencingToolPanelContent({
  graph,
  readOnly,
  onGraphChange,
}: {
  graph: ReactFlowGraph;
  readOnly?: boolean;
  onGraphChange: (graph: ReactFlowGraph) => void;
}) {
  return (
    <div className="tome-sequencing-tool-panel">
      <QueryFlowEditor graph={graph} readOnly={readOnly} onGraphChange={onGraphChange} />
    </div>
  );
}

export function SequencingBlockComponent({
  ctx,
  blockData,
  onBlockDataChange,
  readOnly,
}: {
  ctx: {
    component: { id: string; label: string };
    nodeId: string;
    invoke?: (input: unknown) => Promise<unknown>;
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
  const parsed = parseSequencingBlockData(blockData);
  const [graph, setGraph] = useState<ReactFlowGraph>(parsed.reactFlow);
  const [layout, setLayout] = useState<TimelineLayout | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const next = parseSequencingBlockData(blockData);
    setGraph(next.reactFlow);
  }, [blockData]);

  const persistGraph = useCallback(
    (next: ReactFlowGraph) => {
      setGraph(next);
      onBlockDataChange(toBlockData(next));
    },
    [onBlockDataChange],
  );

  const runArrange = useCallback(async () => {
    if (!ctx.invoke) {
      setError("Sequencing invoke is not available");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await ctx.invoke({
        action: "arrange",
        nodeId: ctx.nodeId,
        data: toBlockData(graph),
      });
      const record =
        result && typeof result === "object" && !Array.isArray(result)
          ? (result as Record<string, unknown>)
          : {};
      if (record.ok === false) {
        setLayout(null);
        setError(typeof record.error === "string" ? record.error : "Arrange failed");
        return;
      }
      const layoutValue = record.layout;
      if (!layoutValue || typeof layoutValue !== "object") {
        setLayout(null);
        setError("Arrange returned no layout");
        return;
      }
      setLayout(layoutValue as TimelineLayout);
    } catch (err: unknown) {
      setLayout(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [ctx, graph]);

  useEffect(() => {
    void runArrange();
  }, [ctx.nodeId]); // eslint-disable-line react-hooks/exhaustive-deps -- initial + node change

  const openEditor = () => {
    if (!ctx.openToolPanel) return;
    ctx.openToolPanel({
      title: "Edit timeline query",
      Component: SequencingToolPanelContent as (props: Record<string, unknown>) => unknown,
      props: {
        graph,
        readOnly,
        onGraphChange: persistGraph,
      },
      onClose: () => {
        void runArrange();
      },
    });
  };

  return (
    <div className="tome-sequencing-block" data-tome-sequencing="1">
      <div className="tome-sequencing-toolbar">
        <button type="button" onClick={() => void runArrange()} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
        {!readOnly && (
          <button type="button" onClick={openEditor}>
            Edit query
          </button>
        )}
      </div>
      {error && (
        <pre className="tome-sequencing-error" tabIndex={0}>
          {error}
        </pre>
      )}
      {layout && !error && <SequencingTimelineView layout={layout} />}
      {!layout && !error && !loading && (
        <p className="tome-sequencing-empty">No timeline events.</p>
      )}
    </div>
  );
}

export function register(host: EditorPageBlockHost): void {
  host.registerPageBlock({
    implementationId: IMPLEMENTATION_ID,
    interactive: true,
    slashMenu: { label: "Timeline", group: "custom", order: 50 },
    insertDefaultData: () => defaultBlockData(),
    Component: SequencingBlockComponent,
  });
}

export { COMPONENT_ID, IMPLEMENTATION_ID };
