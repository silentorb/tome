import { useCallback, useEffect, useMemo, useState } from "react";
import type { Graph } from "imp-core-types";
import type { EditorPageBlockHost } from "tome-interfaces/page-block/editor";
import type { GraphLayout } from "tome-imp-view/layout";
import { TomeImpView } from "tome-imp-view/editor";
import { createQueryRegistry } from "tome-query/execute";
import {
  listGraphParameters,
  resolveGraphParameterValues,
  type GraphParameterValue,
} from "tome-query/parameters";
import {
  BLOCK_ROLE,
  COMPONENT_ID,
  IMPLEMENTATION_ID,
  SEQUENCING_BLOCK_VERSION,
  defaultBlockData,
  parseSequencingBlockData,
  type SequencingBlockData,
} from "./config";
import type { DependsConstraint, SequenceEndpoint } from "tome-sequencing-interfaces";
import { SequencingTimelineView } from "./timeline";
import type { TimelineLayout } from "./layout";
import "./sequencing-block.css";

function toBlockData(graph: Graph, graphLayout: GraphLayout): SequencingBlockData {
  return {
    version: SEQUENCING_BLOCK_VERSION,
    graph,
    layout: graphLayout,
  };
}

export function SequencingToolPanelContent({
  graph,
  graphLayout,
  readOnly,
  onGraphChange,
  onLayoutChange,
}: {
  graph: Graph;
  graphLayout: GraphLayout;
  readOnly?: boolean;
  onGraphChange: (graph: Graph) => void;
  onLayoutChange: (layout: GraphLayout) => void;
}) {
  return (
    <div className="tome-sequencing-tool-panel">
      <TomeImpView
        graph={graph}
        layout={graphLayout}
        readOnly={readOnly}
        onGraphChange={onGraphChange}
        onLayoutChange={onLayoutChange}
        createRegistry={createQueryRegistry}
      />
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
    getBlockParametersRevision?: () => number;
    getSequencingShowDependencyEdges?: () => boolean;
    setSequencingShowDependencyEdges?: (value: boolean) => Promise<void>;
  };
  blockData: unknown;
  onBlockDataChange: (data: unknown) => void;
  readOnly?: boolean;
}) {
  const parsed = parseSequencingBlockData(blockData);
  const [graph, setGraph] = useState<Graph>(parsed.graph);
  const [graphLayout, setGraphLayout] = useState<GraphLayout>(parsed.layout);
  const [layout, setLayout] = useState<TimelineLayout | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [paramTick, setParamTick] = useState(0);

  useEffect(() => {
    const next = parseSequencingBlockData(blockData);
    setGraph(next.graph);
    setGraphLayout(next.layout);
  }, [blockData]);

  const blockParametersRevision = ctx.getBlockParametersRevision?.() ?? 0;

  const parameterSpecs = useMemo(() => listGraphParameters(graph), [graph]);
  const parameterValues = useMemo(() => {
    void paramTick;
    void blockParametersRevision;
    const overrides = ctx.getBlockParameters?.() ?? {};
    return resolveGraphParameterValues(graph, overrides);
  }, [ctx, graph, paramTick, blockParametersRevision]);

  const persist = useCallback(
    (nextGraph: Graph, nextLayout: GraphLayout) => {
      setGraph(nextGraph);
      setGraphLayout(nextLayout);
      onBlockDataChange(toBlockData(nextGraph, nextLayout));
    },
    [onBlockDataChange],
  );

  const persistGraph = useCallback(
    (next: Graph) => {
      persist(next, graphLayout);
    },
    [graphLayout, persist],
  );

  const persistGraphLayout = useCallback(
    (next: GraphLayout) => {
      persist(graph, next);
    },
    [graph, persist],
  );

  const applyInvokeResult = useCallback(
    (result: unknown, previous: TimelineLayout | null): boolean => {
      const record =
        result && typeof result === "object" && !Array.isArray(result)
          ? (result as Record<string, unknown>)
          : {};
      if (record.ok === false) {
        const message = typeof record.error === "string" ? record.error : "Arrange failed";
        setError(message);
        const depends = record.depends;
        if (previous && Array.isArray(depends)) {
          setLayout({
            ...previous,
            depends: depends as DependsConstraint[],
          });
        }
        return false;
      }
      const layoutValue = record.layout;
      if (!layoutValue || typeof layoutValue !== "object") {
        setLayout(null);
        setError("Arrange returned no layout");
        return false;
      }
      setError(null);
      setLayout(layoutValue as TimelineLayout);
      return true;
    },
    [],
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
        data: toBlockData(graph, graphLayout),
        parameters: resolveGraphParameterValues(graph, overrides),
      });
      applyInvokeResult(result, null);
    } catch (err: unknown) {
      setLayout(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [applyInvokeResult, ctx, graph, graphLayout]);

  useEffect(() => {
    void runArrange();
  }, [ctx.nodeId, paramTick, blockParametersRevision]); // eslint-disable-line react-hooks/exhaustive-deps -- initial + node/param change

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

  const mutateDepends = useCallback(
    async (
      action: "addDepends" | "removeDepends",
      prerequisiteId: string,
      dependentId: string,
      from: SequenceEndpoint,
      to: SequenceEndpoint,
    ) => {
      if (!ctx.invoke) {
        setError("Sequencing invoke is not available");
        return;
      }
      const previous = layout;
      setLoading(true);
      try {
        const overrides = ctx.getBlockParameters?.() ?? {};
        const result = await ctx.invoke({
          action,
          nodeId: ctx.nodeId,
          data: toBlockData(graph, graphLayout),
          parameters: resolveGraphParameterValues(graph, overrides),
          prerequisiteId,
          dependentId,
          from,
          to,
        });
        applyInvokeResult(result, previous);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [applyInvokeResult, ctx, graph, graphLayout, layout],
  );

  const showDependencyEdges = ctx.getSequencingShowDependencyEdges?.() ?? false;

  const openEditor = () => {
    if (!ctx.openToolPanel) return;
    ctx.openToolPanel({
      title: "Edit timeline query",
      Component: SequencingToolPanelContent as (props: Record<string, unknown>) => unknown,
      props: {
        graph,
        graphLayout,
        readOnly,
        onGraphChange: persistGraph,
        onLayoutChange: persistGraphLayout,
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
      {layout && (
        <SequencingTimelineView
          layout={layout}
          graphParameters={parameterSpecs}
          parameterValues={parameterValues}
          onParameterChange={handleParameterChange}
          showDependencyEdges={showDependencyEdges}
          onShowDependencyEdgesChange={
            ctx.setSequencingShowDependencyEdges
              ? (value) => {
                  void ctx.setSequencingShowDependencyEdges?.(value);
                }
              : undefined
          }
          onAddDepends={
            readOnly
              ? undefined
              : (prerequisiteId, dependentId, from, to) =>
                  mutateDepends("addDepends", prerequisiteId, dependentId, from, to)
          }
          onRemoveDepends={
            readOnly
              ? undefined
              : (prerequisiteId, dependentId, from, to) =>
                  mutateDepends("removeDepends", prerequisiteId, dependentId, from, to)
          }
          readOnly={readOnly}
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

export { BLOCK_ROLE, COMPONENT_ID, IMPLEMENTATION_ID };
