import { executeGraph } from "imp-execution";
import type { Graph } from "imp-core-types";
import {
  compileImpGraphToTomeSql,
  createTomeImpRegistry,
  resolveCorpusConstraint,
  spliceCorpusNodes,
  type TomeCorpusLookup,
} from "tome-imp-sql";
import { createFlatfileExecutionHost } from "tome-imp-flatfile";
import type {
  ExecuteImpContext,
  ImpCollectionResult,
  ImpExecutionBackend,
  ImpGraph,
  TomeGraphStoreBase,
} from "tome-graph-interfaces";
import type { TomeQueryCache } from "tome-service-interfaces";
import type { SQLQueryBindings } from "bun:sqlite";
import { loadSchemaFromContent } from "tome-flatfile";
import { withProfilingSpan, withProfilingSpanAsync } from "tome-service-interfaces";
import { graphHasSearchNode, runSearchImpGraphSql } from "./search-graph";

export interface RunExecuteImpOptions {
  backend: ImpExecutionBackend;
  store: TomeGraphStoreBase;
  graph: ImpGraph;
  context?: ExecuteImpContext;
  cache?: TomeQueryCache;
  corpus?: TomeCorpusLookup;
  search?: import("tome-interfaces/search").TomeSearch | null;
}

function impGraphToGraph(graph: ImpGraph): Graph {
  return graph as Graph;
}

function applyParameters(graph: Graph, parameters?: Record<string, unknown>): Graph {
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

async function corpusLookupFromStore(store: TomeGraphStoreBase): Promise<TomeCorpusLookup> {
  const allIds = await store.listNodeIds();
  return {
    corpusIdForNode(nodeId: string): string | null {
      return store.locateNode(nodeId);
    },
    nodeIdsInCorpus(corpusId: string): readonly string[] {
      return allIds.filter((id) => store.locateNode(id) === corpusId);
    },
  };
}

function filterRowsByCorpus(
  result: ImpCollectionResult,
  nodeIds: readonly string[] | null,
): ImpCollectionResult {
  if (nodeIds === null) return result;
  const allowed = new Set(nodeIds);
  return {
    columns: result.columns,
    rows: result.rows.filter((row) => typeof row.id === "string" && allowed.has(row.id)),
  };
}

/** Execute an Imp graph via SQL lowering or imp-execution over flatfile. */
export async function runExecuteImp(options: RunExecuteImpOptions): Promise<ImpCollectionResult> {
  const corpus = options.corpus ?? (await corpusLookupFromStore(options.store));
  let graph = applyParameters(impGraphToGraph(options.graph), options.context?.parameters);
  const constraint = await resolveCorpusConstraint(graph, {
    pageNodeId: options.context?.pageNodeId,
    corpus,
  });
  graph = spliceCorpusNodes(graph);
  const backendAttr = { "imp.backend": options.backend };

  if (graphHasSearchNode(graph)) {
    if (options.backend === "sql") {
      if (!options.cache) {
        throw new Error("SQL executeImp backend requires a query cache");
      }
      return withProfilingSpanAsync(
        "imp.search",
        "INTERNAL",
        backendAttr,
        async () =>
          filterRowsByCorpus(
            await runSearchImpGraphSql(
              options.store,
              options.cache!,
              graph,
              options.context,
              options.search,
            ),
            constraint.nodeIds,
          ),
      );
    }
  }

  if (options.backend === "sql") {
    if (!options.cache) {
      throw new Error("SQL executeImp backend requires a query cache");
    }
    const contentDir = options.store.contentDir;
    const compiled = await withProfilingSpanAsync("imp.compile", "INTERNAL", backendAttr, () =>
      compileImpGraphToTomeSql(graph, {
        schema: loadSchemaFromContent(contentDir),
        pageNodeId: options.context?.pageNodeId,
        corpus,
      }),
    );
    const rows = await withProfilingSpanAsync("imp.execute", "INTERNAL", backendAttr, () =>
      options.cache!.queryAll(compiled.sql, ...(compiled.parameters as SQLQueryBindings[])),
    );
    return filterRowsByCorpus(
      { columns: rows[0] ? Object.keys(rows[0]) : ["id"], rows },
      constraint.nodeIds,
    );
  }

  const host = await createFlatfileExecutionHost(options.store, {
    liveOnly: true,
    corpusNodeIds: constraint.nodeIds,
  });
  const executed = await withProfilingSpanAsync("imp.execute", "INTERNAL", backendAttr, () =>
    executeGraph(graph, {
      registry: createTomeImpRegistry(),
      host,
    }),
  );
  return filterRowsByCorpus(executed, constraint.nodeIds);
}

/** SQL-only execute when backend is known to be sql. */
export async function runExecuteImpSql(
  store: TomeGraphStoreBase,
  cache: TomeQueryCache,
  graph: ImpGraph,
  context?: ExecuteImpContext,
  search?: import("tome-interfaces/search").TomeSearch | null,
): Promise<ImpCollectionResult> {
  const corpus = await corpusLookupFromStore(store);
  let impGraph = applyParameters(impGraphToGraph(graph), context?.parameters);
  await resolveCorpusConstraint(impGraph, { pageNodeId: context?.pageNodeId, corpus });
  impGraph = spliceCorpusNodes(impGraph);
  const backendAttr = { "imp.backend": "sql" as const };
  if (graphHasSearchNode(impGraph)) {
    return withProfilingSpanAsync("imp.search", "INTERNAL", backendAttr, () =>
      runSearchImpGraphSql(store, cache, impGraph as ImpGraph, context, search),
    );
  }
  const compiled = await withProfilingSpanAsync("imp.compile", "INTERNAL", backendAttr, () =>
    compileImpGraphToTomeSql(impGraph, {
      schema: loadSchemaFromContent(store.contentDir),
      pageNodeId: context?.pageNodeId,
      corpus,
    }),
  );
  const rows = await withProfilingSpanAsync("imp.execute", "INTERNAL", backendAttr, () =>
    cache.queryAll(compiled.sql, ...(compiled.parameters as SQLQueryBindings[])),
  );
  return { columns: rows[0] ? Object.keys(rows[0]) : ["id"], rows };
}
