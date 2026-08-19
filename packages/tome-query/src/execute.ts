import type { Graph } from "imp-spec";
import type { ReactFlowGraph } from "imp-react-flow";
import type { SchemaFile } from "tome-flatfile/schema-file";
import {
  decodePropertyLiteral,
  enumIdForPropertyKey,
} from "tome-flatfile/enum-property-codec";
import { resolvePropertyEnum } from "tome-flatfile/property-enums-core";
import { reactFlowToImp } from "imp-react-flow";
import {
  compileImpGraphToTomeSql,
  createTomeImpRegistry,
  type TomeCorpusLookup,
} from "tome-imp-sql";
import { dedupeInboundReactFlowEdges } from "./config";

export { createTomeImpRegistry as createQueryRegistry };

const TITLE_EXTRACT = `json_extract(properties, '$.title') as title`;

export interface CompiledTomeQuery {
  sql: string;
  parameters: unknown[];
}

export type GroupDirection = "asc" | "desc";

export interface QueryGroupSpec {
  column: string;
  direction: GroupDirection;
}

export interface QueryGroup {
  key: string;
  rows: Record<string, unknown>[];
}

export interface GroupedQueryResult {
  groups: QueryGroup[];
  groupColumn: string;
  direction: GroupDirection;
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
  pageNodeId?: string;
  corpus?: TomeCorpusLookup;
}

export function compileReactFlowQuery(
  reactFlow: ReactFlowGraph,
  options?: CompileReactFlowQueryOptions,
): CompiledTomeQuery {
  const edges = dedupeInboundReactFlowEdges(reactFlow.edges);
  const graph = ensureIdentityTitleProjection(reactFlowToImp(reactFlow.nodes, edges));
  const compiled = compileImpGraphToTomeSql(graph, {
    schema: options?.schema,
    pageNodeId: options?.pageNodeId,
    corpus: options?.corpus,
  });
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

function inboundEdge(graph: Graph, nodeId: string, port: string) {
  return Object.values(graph.edges).find((edge) => edge.to.node === nodeId && edge.to.port === port);
}

function literalFromPort(graph: Graph, nodeId: string, port: string): unknown {
  const node = graph.nodes[nodeId];
  if (!node) return undefined;
  const edge = inboundEdge(graph, nodeId, port);
  if (edge) {
    const from = graph.nodes[edge.from.node];
    if (!from) return undefined;
    if (from.type === "literal" || from.type === "parameter") {
      return from.inputs?.value;
    }
    if (from.type === "column") {
      return from.inputs?.name;
    }
    return literalFromPort(graph, from.id, edge.from.port);
  }
  return node.inputs?.[port];
}

/** If the pipeline feeding `output` is a `group` node, return its column/direction. */
export function findTerminalGroupSpec(graph: Graph): QueryGroupSpec | null {
  const outputs = Object.values(graph.nodes).filter((node) => node.type === "output");
  if (outputs.length !== 1) return null;
  const edge = inboundEdge(graph, outputs[0]!.id, "value");
  if (!edge) return null;
  const source = graph.nodes[edge.from.node];
  if (!source || source.type !== "group") return null;
  const columnRaw = literalFromPort(graph, source.id, "column");
  if (typeof columnRaw !== "string" || !columnRaw.trim()) return null;
  const directionRaw = literalFromPort(graph, source.id, "direction");
  const direction: GroupDirection =
    directionRaw === "desc" || directionRaw === "asc" ? directionRaw : "asc";
  return { column: columnRaw.trim(), direction };
}

export function findTerminalGroupSpecFromReactFlow(
  reactFlow: ReactFlowGraph,
): QueryGroupSpec | null {
  const edges = dedupeInboundReactFlowEdges(reactFlow.edges);
  return findTerminalGroupSpec(reactFlowToImp(reactFlow.nodes, edges));
}

function valueFromProperties(properties: unknown, column: string): unknown {
  if (properties && typeof properties === "object" && !Array.isArray(properties)) {
    return (properties as Record<string, unknown>)[column];
  }
  if (typeof properties === "string") {
    try {
      const parsed = JSON.parse(properties) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return (parsed as Record<string, unknown>)[column];
      }
    } catch {
      /* ignore */
    }
  }
  return undefined;
}

export function groupKeyFromRow(
  row: Record<string, unknown>,
  column: string,
  schema?: SchemaFile,
): string {
  let raw = row[column];
  if (raw === undefined || raw === null) {
    raw = valueFromProperties(row.properties, column);
  }
  const decoded = schema ? decodePropertyLiteral(column, raw, schema) : raw;
  if (decoded === undefined || decoded === null || decoded === "") return "";
  return String(decoded);
}

function groupWeight(column: string, key: string, schema?: SchemaFile): number | null {
  if (!schema || !key) return null;
  const enumId = enumIdForPropertyKey(column, schema);
  if (!enumId) return null;
  const enumDef = resolvePropertyEnum(enumId, schema);
  if (!enumDef) return null;
  if (enumDef.values && Object.prototype.hasOwnProperty.call(enumDef.values, key)) {
    return enumDef.values[key]!;
  }
  const index = enumDef.options.indexOf(key);
  return index >= 0 ? index : null;
}

/** Partition executed rows into groups; sort group keys by schema enum `values` when present. */
export function partitionRowsIntoGroups(
  rows: Record<string, unknown>[],
  spec: QueryGroupSpec,
  schema?: SchemaFile,
): GroupedQueryResult {
  const order: string[] = [];
  const byKey = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const key = groupKeyFromRow(row, spec.column, schema);
    let list = byKey.get(key);
    if (!list) {
      list = [];
      byKey.set(key, list);
      order.push(key);
    }
    list.push(row);
  }
  order.sort((left, right) => {
    const leftWeight = groupWeight(spec.column, left, schema);
    const rightWeight = groupWeight(spec.column, right, schema);
    let cmp: number;
    if (leftWeight != null && rightWeight != null && leftWeight !== rightWeight) {
      cmp = leftWeight - rightWeight;
    } else {
      cmp = left.localeCompare(right);
    }
    return spec.direction === "desc" ? -cmp : cmp;
  });
  return {
    groupColumn: spec.column,
    direction: spec.direction,
    groups: order.map((key) => ({ key, rows: byKey.get(key)! })),
  };
}
