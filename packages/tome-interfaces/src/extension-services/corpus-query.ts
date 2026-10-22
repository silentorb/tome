/**
 * Host-mediated corpus routing for extension page blocks (pre-SQL query scoping).
 * Prefer session SQLite `nodes.corpus_id` when a query cache is available; flatfile
 * routing map is the fallback for cache-less hosts.
 */
export interface ExtensionCorpusQueryServices {
  corpusIdForNode(nodeId: string): string | null | Promise<string | null>;
  nodeIdsInCorpus(corpusId: string): readonly string[] | Promise<readonly string[]>;
}
