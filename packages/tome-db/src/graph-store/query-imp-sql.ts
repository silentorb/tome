import type { Graph } from "imp-core-types";
import {
  compileImpGraphToTomeSql,
  type TomeCorpusLookup,
} from "tome-imp-sql";
import type {
  ExecuteImpContext,
  ImpCollectionResult,
  ImpGraph,
  SchemaFile,
} from "tome-graph-interfaces";
import type { TomeQueryCache } from "tome-service-interfaces";
import type { SQLQueryBindings } from "bun:sqlite";
import { withProfilingSpanAsync } from "tome-service-interfaces";

/**
 * Options for product Imp → SQL cache queries.
 * Shaped so `POST /api/nodes/query` can adopt the same helper later
 * (`parameters` / `pageNodeId` match {@link ExecuteImpContext}).
 */
export type QueryImpSqlOptions = {
  parameters?: ExecuteImpContext["parameters"];
  pageNodeId?: ExecuteImpContext["pageNodeId"];
  schema?: SchemaFile;
  /** Optional corpus lookup when the graph uses a corpus operator. */
  corpus?: TomeCorpusLookup;
};

export function applyImpParameters(
  graph: Graph,
  parameters?: Record<string, unknown>,
): Graph {
  if (!parameters || Object.keys(parameters).length === 0) return graph;
  const nodes = { ...graph.nodes };
  for (const node of Object.values(nodes)) {
    if (node.type !== "parameter") continue;
    const label = node.inputs?.label;
    if (typeof label !== "string" || !(label in parameters)) continue;
    nodes[node.id] = {
      ...node,
      inputs: { ...node.inputs, value: parameters[label] as string | number | boolean | null },
    };
  }
  return { ...graph, nodes };
}

/**
 * Compile an Imp collection graph to Tome SQL and run it on the query cache.
 * Does not touch flatfile / {@link TomeGraphStoreBase.listNodeIds} / GraphStore.executeImp.
 */
export async function queryImpSql(
  cache: TomeQueryCache,
  graph: ImpGraph,
  options?: QueryImpSqlOptions,
): Promise<ImpCollectionResult> {
  const impGraph = applyImpParameters(graph as Graph, options?.parameters);
  const backendAttr = { "imp.backend": "sql" as const };
  const compiled = await withProfilingSpanAsync("imp.compile", "INTERNAL", backendAttr, () =>
    compileImpGraphToTomeSql(impGraph, {
      schema: options?.schema,
      pageNodeId: options?.pageNodeId,
      corpus: options?.corpus,
    }),
  );
  const rows = await withProfilingSpanAsync("imp.execute", "INTERNAL", backendAttr, () =>
    cache.queryAll(compiled.sql, ...(compiled.parameters as SQLQueryBindings[])),
  );
  return { columns: rows[0] ? Object.keys(rows[0]) : ["id"], rows };
}
