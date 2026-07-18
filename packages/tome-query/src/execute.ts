import { collectionTransformsLibrary } from "imp-collection-transforms";
import { reactFlowToImp, type ReactFlowGraph } from "imp-react-flow";
import { createRegistry, loadLibrary } from "imp-registry";
import { coreNodeLibrary } from "imp-spec";
import { compileSql, graphToKysely } from "imp-sql";
import { dedupeInboundReactFlowEdges } from "./config";
import { applyLiveNodesConstraint, tomeLiveNodesSchema } from "./schema";

export function createQueryRegistry() {
  return loadLibrary(loadLibrary(createRegistry(), coreNodeLibrary), collectionTransformsLibrary);
}

export interface CompiledTomeQuery {
  sql: string;
  parameters: unknown[];
}

export function compileReactFlowQuery(reactFlow: ReactFlowGraph): CompiledTomeQuery {
  const edges = dedupeInboundReactFlowEdges(reactFlow.edges);
  const graph = reactFlowToImp(reactFlow.nodes, edges);
  const compiled = graphToKysely(graph, {
    registry: createQueryRegistry(),
    schema: tomeLiveNodesSchema,
  });
  const { sql, parameters } = compileSql(compiled);
  return applyLiveNodesConstraint(sql, parameters);
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
