import type { ExtensionCorpusQueryServices } from "tome-interfaces/extension-services/corpus-query";
import type { TomeGraphStoreBase } from "tome-graph-interfaces";

/** Corpus lookup from the graph store routing map (not SQLite). */
export function createExtensionCorpusQueryServices(
  store: TomeGraphStoreBase,
): ExtensionCorpusQueryServices {
  return {
    corpusIdForNode(nodeId: string): string | null {
      return store.locateNode(nodeId);
    },
    async nodeIdsInCorpus(corpusId: string): Promise<readonly string[]> {
      return (await store.listNodeIds()).filter((id) => store.locateNode(id) === corpusId);
    },
  };
}
