import type { ExtensionSqlQueryServices } from "tome-interfaces/extension-services/sql-query";
import type { ReactFlowGraph } from "imp-react-flow";
import { compileReactFlowQuery, rowsToTable, type QueryResultTable } from "./execute";
import { parseQueryBlockData } from "./config";

export async function executeQueryBlock(
  sqlQuery: ExtensionSqlQueryServices | undefined,
  reactFlow: ReactFlowGraph,
): Promise<QueryResultTable> {
  if (!sqlQuery) {
    throw new Error("sqlQuery host service is not available");
  }
  const { sql, parameters } = compileReactFlowQuery(reactFlow);
  const rows = await sqlQuery.queryAll(sql, parameters);
  return rowsToTable(rows);
}

export async function executeQueryBlockData(
  sqlQuery: ExtensionSqlQueryServices | undefined,
  data: unknown,
): Promise<QueryResultTable> {
  const parsed = parseQueryBlockData(data);
  return executeQueryBlock(sqlQuery, parsed.reactFlow);
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderQueryTableHtml(table: QueryResultTable): string {
  const header = table.columns
    .map((column) => `<th>${escapeHtml(column)}</th>`)
    .join("");
  const body = table.rows
    .map((row) => {
      const cells = table.columns
        .map((column) => {
          const value = row[column];
          const text =
            value === null || value === undefined
              ? ""
              : typeof value === "string" || typeof value === "number" || typeof value === "boolean"
                ? String(value)
                : JSON.stringify(value);
          return `<td>${escapeHtml(text)}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  return (
    `<figure class="tome-query-block" data-tome-query="1">` +
    `<div class="tome-query-table-wrap"><table class="tome-query-table">` +
    `<thead><tr>${header}</tr></thead>` +
    `<tbody>${body}</tbody>` +
    `</table></div>` +
    `<p class="tome-query-meta">${table.rows.length} row${table.rows.length === 1 ? "" : "s"}</p>` +
    `</figure>`
  );
}

export function renderQueryPlaceholderHtml(message: string): string {
  return (
    `<figure class="tome-query-block tome-query-placeholder" data-tome-query="1">` +
    `<p>${escapeHtml(message)}</p>` +
    `</figure>`
  );
}
