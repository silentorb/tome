import { useCallback, useEffect, useMemo, useState } from "react";
import type { EditorPageBlockHost } from "tome-interfaces/page-block/editor";
import type { ReactFlowGraph } from "imp-react-flow";
import { QueryFlowEditor } from "tome-query/query-editor";
import {
  listGraphParameters,
  resolveGraphParameterValues,
  type GraphParameterValue,
} from "tome-query/parameters";
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
    getBlockParameters?: () => Record<string, GraphParameterValue>;
    setBlockParameter?: (
      paramId: string,
      value: string | number | boolean | null,
    ) => Promise<void>;
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
  const [paramTick, setParamTick] = useState(0);

  useEffect(() => {
    const next = parseSequencingBlockData(blockData);
    setGraph(next.reactFlow);
  }, [blockData]);

  const parameterSpecs = useMemo(() => listGraphParameters(graph), [graph]);
  const parameterValues = useMemo(() => {
    void paramTick;
    const overrides = ctx.getBlockParameters?.() ?? {};
    return resolveGraphParameterValues(graph, overrides);
  }, [ctx, graph, paramTick]);

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
      const overrides = ctx.getBlockParameters?.() ?? {};
      const result = await ctx.invoke({
        action: "arrange",
        nodeId: ctx.nodeId,
        data: toBlockData(graph),
        parameters: resolveGraphParameterValues(graph, overrides),
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
  }, [ctx.nodeId, paramTick]); // eslint-disable-line react-hooks/exhaustive-deps -- initial + node/param change

  const handleParameterChange = useCallback(
    async (paramId: string, value: GraphParameterValue) => {
      const spec = parameterSpecs.find((p) => p.id === paramId);
      if (ctx.setBlockParameter) {
        if (spec && Object.is(value, spec.defaultValue)) {
          await ctx.setBlockParameter(paramId, null);
        } else {
          await ctx.setBlockParameter(paramId, value);
        }
      }
      setParamTick((n) => n + 1);
    },
    [ctx, parameterSpecs],
  );

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
      {layout && !error && (
        <SequencingTimelineView
          layout={layout}
          graphParameters={parameterSpecs}
          parameterValues={parameterValues}
          onParameterChange={handleParameterChange}
        />
      )}
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
