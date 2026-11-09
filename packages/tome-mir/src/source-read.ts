import type {
  ExecuteImpContext,
  ImpCollectionResult,
  ImpGraph,
  TomeGraphStoreQueryable,
} from "tome-graph-interfaces";
import type { SyncSourceRead } from "tome-service-interfaces/sync";

export function syncSourceFromQueryable(store: TomeGraphStoreQueryable): SyncSourceRead {
  return {
    executeImp(
      graph: ImpGraph,
      context?: ExecuteImpContext,
    ): ImpCollectionResult | Promise<ImpCollectionResult> {
      return store.executeImp(graph, context);
    },
  };
}
