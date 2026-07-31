import type { ReactFlowGraph } from "imp-react-flow";
import { reactFlowToImp } from "imp-react-flow";
import {
  compileImpGraphToTomeSql,
  createTomeImpRegistry,
} from "tome-imp-sql";
import { dedupeInboundReactFlowEdges } from "./config";

export { createTomeImpRegistry as createQueryRegistry };

export interface CompiledTomeQuery {
  sql: string;
  parameters: unknown[];
}

export function compileReactFlowQuery(reactFlow: ReactFlowGraph): CompiledTomeQuery {
  const edges = dedupeInboundReactFlowEdges(reactFlow.edges);
  const graph = reactFlowToImp(reactFlow.nodes, edges);
  return compileImpGraphToTomeSql(graph);
}

export interface QueryResultTable {
  columns: string[];
  rows: Record<string, unknown>[];
}

export function rowsToTable(rows: Record<string, unknown>[]): QueryResultTable {
  const columnSet = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      columnSet.add(key);
    }
  }
  const preferred = ["id", "title"];
  const columns = [
    ...preferred.filter((key) => columnSet.has(key)),
    ...[...columnSet].filter((key) => !preferred.includes(key)).sort(),
  ];
  return { columns, rows };
}
