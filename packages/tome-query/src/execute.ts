import type { Graph } from "imp-spec";
import type { ReactFlowGraph } from "imp-react-flow";
import type { SchemaFile } from "tome-flatfile/schema-file";
import { reactFlowToImp } from "imp-react-flow";
import {
  compileImpGraphToTomeSql,
  createTomeImpRegistry,
} from "tome-imp-sql";
import { dedupeInboundReactFlowEdges } from "./config";

export { createTomeImpRegistry as createQueryRegistry };

const TITLE_EXTRACT = `json_extract(properties, '$.title') as title`;

export interface CompiledTomeQuery {
  sql: string;
  parameters: unknown[];
}

/** Ensure every project lists id + title (link plumbing); leave author order for extras. */
export function ensureIdentityTitleProjection(graph: Graph): Graph {
  const nodes: Graph["nodes"] = { ...graph.nodes };
  let changed = false;
  for (const [nodeId, node] of Object.entries(graph.nodes)) {
    if (node.type !== "project") continue;
    const raw = node.inputs?.columns;
    if (typeof raw !== "string") continue;
    const author = raw
      .split(",")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    const merged = [...author];
    for (const required of ["id", "title"]) {
      if (!merged.includes(required)) merged.push(required);
    }
    const nextColumns = merged.join(",");
    if (nextColumns === raw) continue;
    nodes[nodeId] = {
      ...node,
      inputs: { ...node.inputs, columns: nextColumns },
    };
    changed = true;
  }
  if (!changed) return graph;
  return { ...graph, nodes };
}

/** When there is no project (SELECT *), expose title as an aliased column. */
export function ensureTitleColumnInSelectStar(sql: string): string {
  if (!/^\s*select\s+\*\s+from\b/i.test(sql)) {
    return sql;
  }
  if (/\bas\s+title\b/i.test(sql) || /\btitle\s*,/i.test(sql)) {
    return sql;
  }
  return sql.replace(/^\s*select\s+\*\s+from\b/i, `select *, ${TITLE_EXTRACT} from`);
}

export interface CompileReactFlowQueryOptions {
  schema?: SchemaFile;
}

export function compileReactFlowQuery(
  reactFlow: ReactFlowGraph,
  options?: CompileReactFlowQueryOptions,
): CompiledTomeQuery {
  const edges = dedupeInboundReactFlowEdges(reactFlow.edges);
  const graph = ensureIdentityTitleProjection(reactFlowToImp(reactFlow.nodes, edges));
  const compiled = compileImpGraphToTomeSql(graph, { schema: options?.schema });
  return {
    sql: ensureTitleColumnInSelectStar(compiled.sql),
    parameters: compiled.parameters,
  };
}

export interface QueryResultTable {
  columns: string[];
  rows: Record<string, unknown>[];
}

/**
 * Visible columns: title first (link column), then other keys except id/title plumbing.
 * Row objects retain id/title for link rendering.
 */
export function rowsToTable(rows: Record<string, unknown>[]): QueryResultTable {
  const normalized = rows.map((row) => {
    if (row.title !== undefined && row.title !== null) return row;
    const props = row.properties;
    if (typeof props !== "string") return row;
    try {
      const parsed = JSON.parse(props) as Record<string, unknown>;
      if (typeof parsed.title === "string" || typeof parsed.title === "number") {
        return { ...row, title: parsed.title };
      }
    } catch {
      /* keep row */
    }
    return row;
  });

  const columnSet = new Set<string>();
  for (const row of normalized) {
    for (const key of Object.keys(row)) {
      columnSet.add(key);
    }
  }
  const plumbing = new Set(["id", "title"]);
  const rest = [...columnSet].filter((key) => !plumbing.has(key)).sort();
  const columns = columnSet.has("title") || normalized.some((r) => r.id != null)
    ? ["title", ...rest]
    : rest;
  return { columns, rows: normalized };
}
