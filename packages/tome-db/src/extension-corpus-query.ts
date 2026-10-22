import type { ExtensionCorpusQueryServices } from "tome-interfaces/extension-services/corpus-query";
import type { TomeGraphStoreBase } from "tome-graph-interfaces";
import type { TomeQueryCache } from "tome-service-interfaces";

/** Corpus lookup preferring session SQLite `corpus_id` when a cache is available. */
export function createExtensionCorpusQueryServices(
  store: TomeGraphStoreBase,
  cache?: TomeQueryCache,
): ExtensionCorpusQueryServices {
  if (cache) {
    return {
      corpusIdForNode(nodeId: string): Promise<string | null> {
        return cache.corpusIdForNode(nodeId);
      },
      nodeIdsInCorpus(corpusId: string): Promise<readonly string[]> {
        return cache.nodeIdsInCorpus(corpusId);
      },
    };
  }
  return {
    corpusIdForNode(nodeId: string): string | null {
      return store.locateNode(nodeId);
    },
    async nodeIdsInCorpus(corpusId: string): Promise<readonly string[]> {
      return (await store.listNodeIds()).filter((id) => store.locateNode(id) === corpusId);
    },
  };
}
