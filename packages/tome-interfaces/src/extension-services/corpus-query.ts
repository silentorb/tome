/**
 * Host-mediated corpus routing for extension page blocks (pre-SQL query scoping).
 * Backed by the store node→corpus map, not the SQLite cache.
 */
export interface ExtensionCorpusQueryServices {
  corpusIdForNode(nodeId: string): string | null;
  nodeIdsInCorpus(corpusId: string): readonly string[];
}
