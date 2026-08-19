import type { ExtensionCorpusQueryServices } from "tome-interfaces/extension-services/corpus-query";
import type { TomeDataStore } from "tome-service-interfaces";

/** Corpus lookup from the store routing map (not SQLite). */
export function createExtensionCorpusQueryServices(
  store: TomeDataStore,
): ExtensionCorpusQueryServices {
  return {
    corpusIdForNode(nodeId: string): string | null {
      return store.locateNode(nodeId);
    },
    nodeIdsInCorpus(corpusId: string): readonly string[] {
      return store.listNodeIds().filter((id) => store.locateNode(id) === corpusId);
    },
  };
}
