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
import { applyImpParameters } from "./query-imp-sql";
import {
  corpusLookupFromCache,
  graphHasCorpusNode,
  lazyCorpusLookupFromStore,
} from "./query-imp-collection";

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

function resolveCorpusLookup(
  options: RunExecuteImpOptions,
  graph: Graph,
): TomeCorpusLookup | undefined {
  if (options.corpus) return options.corpus;
  if (!graphHasCorpusNode(graph)) return undefined;
  if (options.cache) return corpusLookupFromCache(options.cache);
  return lazyCorpusLookupFromStore(options.store);
}

/** Execute an Imp graph via SQL lowering or imp-execution over flatfile. */
export async function runExecuteImp(options: RunExecuteImpOptions): Promise<ImpCollectionResult> {
  let graph = applyImpParameters(impGraphToGraph(options.graph), options.context?.parameters);
  const corpus = resolveCorpusLookup(options, graph);
  // Flatfile hosts and Imp search (post-filter) need an id set; SQL compile uses corpus_id.
  const materializeNodeIds = options.backend !== "sql" || graphHasSearchNode(graph);
  const constraint = await resolveCorpusConstraint(graph, {
    pageNodeId: options.context?.pageNodeId,
    corpus,
    materializeNodeIds,
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
    return { columns: rows[0] ? Object.keys(rows[0]) : ["id"], rows };
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
  let impGraph = applyImpParameters(impGraphToGraph(graph), context?.parameters);
  const corpus = graphHasCorpusNode(impGraph) ? corpusLookupFromCache(cache) : undefined;
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
