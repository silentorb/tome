import type { ExtensionSqlQueryServices } from "tome-interfaces/extension-services/sql-query";
import type { ReactFlowGraph } from "imp-react-flow";
import type { SchemaFile } from "tome-flatfile/schema-file";
import { compileReactFlowQuery, rowsToTable, type QueryResultTable } from "./execute";
import { parseQueryBlockData } from "./config";
import {
  bindGraphParameters,
  resolveGraphParameterValues,
  type GraphParameterValue,
} from "./parameters";
import { queryNodePageHref } from "./node-links";

export async function executeQueryBlock(
  sqlQuery: ExtensionSqlQueryServices | undefined,
  reactFlow: ReactFlowGraph,
  parameters?: Record<string, GraphParameterValue>,
  schema?: SchemaFile,
): Promise<QueryResultTable> {
  if (!sqlQuery) {
    throw new Error("sqlQuery host service is not available");
  }
  const values = resolveGraphParameterValues(reactFlow, parameters);
  const bound = bindGraphParameters(reactFlow, values);
  const { sql, parameters: sqlParams } = compileReactFlowQuery(bound, { schema });
  const rows = await sqlQuery.queryAll(sql, sqlParams);
  return rowsToTable(rows);
}

export async function executeQueryBlockData(
  sqlQuery: ExtensionSqlQueryServices | undefined,
  data: unknown,
  parameters?: Record<string, GraphParameterValue>,
  schema?: SchemaFile,
): Promise<QueryResultTable> {
  const parsed = parseQueryBlockData(data);
  return executeQueryBlock(sqlQuery, parsed.reactFlow, parameters, schema);
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatCellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

export function renderQueryTableHtml(
  table: QueryResultTable,
  nodePageHref: (nodeId: string) => string = (id) => queryNodePageHref(id),
): string {
  const header = table.columns
    .map((column) => `<th>${escapeHtml(column)}</th>`)
    .join("");
  const body = table.rows
    .map((row) => {
      const cells = table.columns
        .map((column) => {
          if (column === "title") {
            const id = typeof row.id === "string" ? row.id : null;
            const text = escapeHtml(formatCellText(row.title));
            if (id) {
              const href = escapeHtml(nodePageHref(id));
              return `<td><a class="tome-query-title-link" href="${href}">${text}</a></td>`;
            }
            return `<td>${text}</td>`;
          }
          return `<td>${escapeHtml(formatCellText(row[column]))}</td>`;
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
