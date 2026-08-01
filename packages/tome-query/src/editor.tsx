import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import type { EditorPageBlockHost } from "tome-interfaces/page-block/editor";
import type { ReactFlowGraph } from "imp-react-flow";
import {
  COMPONENT_ID,
  IMPLEMENTATION_ID,
  QUERY_BLOCK_VERSION,
  defaultBlockData,
  parseQueryBlockData,
  type TomeQueryBlockData,
} from "./config";
import { QueryFlowEditor } from "./query-editor";
import type { QueryResultTable } from "./execute";
import { formatCellText } from "./render";
import { queryNodePageHref } from "./node-links";
import "./query-block.css";

function toBlockData(reactFlow: ReactFlowGraph): TomeQueryBlockData {
  return {
    version: QUERY_BLOCK_VERSION,
    reactFlow,
  };
}

/** Panel body for the host right tool panel (React Flow only). */
export function QueryToolPanelContent({
  graph,
  readOnly,
  onGraphChange,
}: {
  graph: ReactFlowGraph;
  readOnly?: boolean;
  onGraphChange: (graph: ReactFlowGraph) => void;
}) {
  return (
    <div className="tome-query-tool-panel">
      <QueryFlowEditor graph={graph} readOnly={readOnly} onGraphChange={onGraphChange} />
    </div>
  );
}

export function QueryBlockComponent({
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
  const parsed = parseQueryBlockData(blockData);
  const [graph, setGraph] = useState<ReactFlowGraph>(parsed.reactFlow);
  const [table, setTable] = useState<QueryResultTable | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const next = parseQueryBlockData(blockData);
    setGraph(next.reactFlow);
  }, [blockData]);

  const persistGraph = useCallback(
    (next: ReactFlowGraph) => {
      setGraph(next);
      onBlockDataChange(toBlockData(next));
    },
    [onBlockDataChange],
  );

  const runQuery = useCallback(async () => {
    if (!ctx.invoke) {
      setError("Query invoke is not available");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await ctx.invoke({
        action: "execute",
        data: toBlockData(graph),
      });
      const record =
        result && typeof result === "object" && !Array.isArray(result)
          ? (result as Record<string, unknown>)
          : {};
      if (record.ok === false) {
        setTable(null);
        setError(typeof record.error === "string" ? record.error : "Query failed");
        return;
      }
      const columns = Array.isArray(record.columns)
        ? record.columns.filter((c): c is string => typeof c === "string")
        : [];
      const rows = Array.isArray(record.rows)
        ? (record.rows as Record<string, unknown>[])
        : [];
      setTable({ columns, rows });
    } catch (err: unknown) {
      setTable(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [ctx.invoke, graph]);

  const runQueryRef = useRef(runQuery);
  runQueryRef.current = runQuery;

  useEffect(() => {
    void runQuery();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- run on mount; Refresh / panel close for re-run

  const openQueryEditor = useCallback(() => {
    if (!ctx.openToolPanel) {
      setError("Query editor panel is not available");
      return;
    }
    ctx.openToolPanel({
      title: "Edit query",
      Component: QueryToolPanelContent as (props: Record<string, unknown>) => unknown,
      props: {
        graph,
        readOnly: Boolean(readOnly),
        onGraphChange: persistGraph,
      },
      onClose: () => {
        void runQueryRef.current();
      },
    });
  }, [ctx, graph, persistGraph, readOnly]);

  return (
    <div className="tome-query-block-ui" data-component-id={ctx.component.id}>
      <div className="tome-query-toolbar">
        <button
          type="button"
          className="tome-query-edit"
          onClick={openQueryEditor}
          disabled={readOnly || !ctx.openToolPanel}
        >
          Edit query
        </button>
        <button
          type="button"
          className="tome-query-run"
          onClick={() => void runQuery()}
          disabled={loading}
          aria-label={loading ? "Running…" : "Refresh"}
          title={loading ? "Running…" : "Refresh"}
        >
          <RefreshCwIcon className={loading ? "is-spinning" : undefined} />
        </button>
      </div>

      <div className="tome-query-table-panel">
        {error ? (
          <textarea
            className="tome-query-error"
            readOnly
            draggable={false}
            value={error}
            aria-label="Query error"
            rows={Math.min(8, Math.max(1, error.split("\n").length))}
            onMouseDown={allowTextSelectionAgainstDraggableAncestors}
            onDragStart={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          />
        ) : null}
        {table ? (
          <div className="tome-query-table-wrap">
            <table className="tome-query-table">
              <thead>
                <tr>
                  {table.columns.map((column) => (
                    <th key={column}>{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, index) => (
                  <tr key={typeof row.id === "string" ? row.id : index}>
                    {table.columns.map((column) => (
                      <td key={column}>{renderCell(column, row)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="tome-query-meta">
              {table.rows.length} row{table.rows.length === 1 ? "" : "s"}
            </p>
          </div>
        ) : !error && loading ? (
          <p className="tome-query-meta">Loading…</p>
        ) : null}
      </div>
    </div>
  );
}

function renderCell(column: string, row: Record<string, unknown>): ReactNode {
  if (column === "title") {
    const id = typeof row.id === "string" ? row.id : null;
    const text = formatCellText(row.title);
    if (id) {
      return (
        <a className="tome-query-title-link" href={queryNodePageHref(id, window.location.href)}>
          {text}
        </a>
      );
    }
    return text;
  }
  return formatCellText(row[column]);
}

/** Lucide refresh-cw (ISC) — inline stroke icon for re-run. */
function RefreshCwIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={["tome-query-run-icon", className].filter(Boolean).join(" ")}
      aria-hidden="true"
    >
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </svg>
  );
}

/**
 * ProseMirror marks selected atom embeds `draggable`; Chromium then starts a native
 * drag of the whole block instead of text selection. Clear that for the gesture.
 */
function allowTextSelectionAgainstDraggableAncestors(
  event: MouseEvent<HTMLTextAreaElement>,
): void {
  const cleared: HTMLElement[] = [];
  let el: HTMLElement | null = event.currentTarget.parentElement;
  while (el) {
    if (el.draggable) {
      el.draggable = false;
      cleared.push(el);
    }
    el = el.parentElement;
  }
  if (cleared.length === 0) return;

  const restore = () => {
    for (const node of cleared) node.draggable = true;
    window.removeEventListener("mouseup", restore);
    window.removeEventListener("blur", restore);
  };
  window.addEventListener("mouseup", restore);
  window.addEventListener("blur", restore);
}

export function register(host: EditorPageBlockHost): void {
  host.registerPageBlock({
    implementationId: IMPLEMENTATION_ID,
    interactive: true,
    slashMenu: { label: "Query table", group: "custom", order: 40 },
    insertDefaultData: () => defaultBlockData(),
    Component: QueryBlockComponent,
  });
}

export { COMPONENT_ID, IMPLEMENTATION_ID };
