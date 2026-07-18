import { useCallback, useEffect, useState } from "react";
import type { EditorPageBlockHost } from "tome-interfaces/page-block/editor";
import type { ReactFlowGraph } from "imp-react-flow";
import {
  COMPONENT_ID,
  IMPLEMENTATION_ID,
  defaultBlockData,
  parseQueryBlockData,
  type TomeQueryBlockData,
} from "./config";
import { QueryFlowEditor } from "./query-editor";
import type { QueryResultTable } from "./execute";
import "./query-block.css";

type ViewMode = "table" | "query";

function QueryBlockComponent({
  ctx,
  blockData,
  onBlockDataChange,
  readOnly,
}: {
  ctx: {
    component: { id: string; label: string };
    nodeId: string;
    invoke?: (input: unknown) => Promise<unknown>;
  };
  blockData: unknown;
  onBlockDataChange: (data: unknown) => void;
  readOnly?: boolean;
}) {
  const parsed = parseQueryBlockData(blockData);
  const [mode, setMode] = useState<ViewMode>("table");
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
      const data: TomeQueryBlockData = { version: 1, reactFlow: next };
      onBlockDataChange(data);
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
        data: { version: 1, reactFlow: graph },
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

  useEffect(() => {
    if (mode !== "table") return;
    void runQuery();
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps -- run on mode enter; Refresh button for re-run

  return (
    <div className="tome-query-block-ui" data-component-id={ctx.component.id}>
      <div className="tome-query-toolbar">
        <div className="tome-query-mode-toggle" role="tablist" aria-label="Query block mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "table"}
            className={mode === "table" ? "is-active" : undefined}
            onClick={() => setMode("table")}
          >
            Table
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "query"}
            className={mode === "query" ? "is-active" : undefined}
            onClick={() => setMode("query")}
          >
            Query
          </button>
        </div>
        {mode === "table" ? (
          <button type="button" className="tome-query-run" onClick={() => void runQuery()} disabled={loading}>
            {loading ? "Running…" : "Refresh"}
          </button>
        ) : null}
      </div>

      {mode === "query" ? (
        <QueryFlowEditor graph={graph} readOnly={readOnly} onGraphChange={persistGraph} />
      ) : (
        <div className="tome-query-table-panel">
          {error ? <p className="tome-query-error">{error}</p> : null}
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
                        <td key={column}>{formatCell(row[column])}</td>
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
      )}
    </div>
  );
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
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
