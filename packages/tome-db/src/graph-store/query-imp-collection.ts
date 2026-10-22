import type { Graph } from "imp-core-types";
import { CORPUS_NODE_TYPE_ID, type TomeCorpusLookup } from "tome-imp-sql";
import type {
  ExecuteImpContext,
  ImpCollectionResult,
  ImpGraph,
  SchemaFile,
  TomeGraphStoreBase,
} from "tome-graph-interfaces";
import type { TomeQueryCache } from "tome-service-interfaces";
import type { TomeSearch } from "tome-interfaces/search";
import { applyImpParameters, queryImpSql } from "./query-imp-sql";
import { graphHasSearchNode, runSearchImpGraphSql } from "./search-graph";

export type QueryImpCollectionOptions = {
  store: TomeGraphStoreBase;
  cache: TomeQueryCache;
  graph: ImpGraph;
  context?: ExecuteImpContext;
  schema?: SchemaFile;
  /** Role-bound searcher for Imp `search` graphs. */
  search?: TomeSearch | null;
  /**
   * Optional corpus lookup. When omitted and the graph has a `corpus` operator,
   * a lazy lookup is built from {@link store} (no eager `listNodeIds`).
   */
  corpus?: TomeCorpusLookup;
};

export function graphHasCorpusNode(graph: Graph): boolean {
  return Object.values(graph.nodes).some((node) => node.type === CORPUS_NODE_TYPE_ID);
}

/** Corpus lookup that only walks ids when `nodeIdsInCorpus` is invoked. */
export function lazyCorpusLookupFromStore(store: TomeGraphStoreBase): TomeCorpusLookup {
  return {
    corpusIdForNode(nodeId: string): string | null {
      return store.locateNode(nodeId);
    },
    async nodeIdsInCorpus(corpusId: string): Promise<readonly string[]> {
      return (await store.listNodeIds()).filter((id) => store.locateNode(id) === corpusId);
    },
  };
}

/**
 * Product Imp collection query: prefer Imp→SQL on the cache; delegate Imp `search`
 * to {@link TomeSearch}. Does not call {@link TomeGraphStoreQueryable.executeImp}
 * and does not eagerly walk flatfile for corpus.
 */
export async function queryImpCollection(
  options: QueryImpCollectionOptions,
): Promise<ImpCollectionResult> {
  const { store, cache, context, schema, search } = options;
  const impGraph = applyImpParameters(options.graph as Graph, context?.parameters);

  if (graphHasSearchNode(impGraph)) {
    return runSearchImpGraphSql(store, cache, impGraph as ImpGraph, context, search);
  }

  const corpus =
    options.corpus ??
    (graphHasCorpusNode(impGraph) ? lazyCorpusLookupFromStore(store) : undefined);

  return queryImpSql(cache, impGraph as ImpGraph, {
    pageNodeId: context?.pageNodeId,
    schema,
    corpus,
  });
}
