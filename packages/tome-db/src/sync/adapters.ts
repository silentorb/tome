import type {
  ExecuteImpContext,
  ImpCollectionResult,
  ImpGraph,
  TomeGraphStoreQueryable,
} from "tome-graph-interfaces";
import type { TomeDataStore, StoreChangeEvent } from "tome-service-interfaces";
import type { CacheSync } from "../content/sync";
import type { SyncEndpoint, DataStoreCapabilities } from "./registry";
import type { SyncSignal, SyncSourceRead } from "./types";
import { storeChangeEventToSyncScope } from "./scope-from-events";

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

/** Flatfile source endpoint — watches store and emits SyncSignals. */
export function createFlatfileSyncEndpoint(options: {
  id: string;
  dataStore: TomeDataStore;
  queryable: TomeGraphStoreQueryable;
}): SyncEndpoint {
  const source = syncSourceFromQueryable(options.queryable);
  const capabilities: DataStoreCapabilities = {
    kind: "flatfile",
    canBeObserved: true,
    canObserve: false,
  };

  return {
    id: options.id,
    capabilities,
    asSource: () => source,
    apply() {
      throw new Error(
        `Flatfile data store "${options.id}" is not a sync sink in the default topology`,
      );
    },
    subscribe(listener) {
      return options.dataStore.subscribe((event: StoreChangeEvent) => {
        const scope = storeChangeEventToSyncScope(event);
        listener({ source, scope });
      });
    },
  };
}

/**
 * SQLite sink wrapping CacheSync.
 * Partial node scopes call syncNode; relationship or full scopes rebuild relationships / ensureReady.
 */
export function createSqliteCacheSyncEndpoint(options: {
  id: string;
  sync: CacheSync;
}): SyncEndpoint & {
  registerInboundSource: (storeId: string, source: SyncSourceRead) => void;
  inboundSourceIds: () => string[];
} {
  const inbound = new Map<string, SyncSourceRead>();
  let applying = false;

  const capabilities: DataStoreCapabilities = {
    kind: "sqlite",
    canBeObserved: false,
    canObserve: true,
  };

  return {
    id: options.id,
    capabilities,
    asSource(): SyncSourceRead {
      throw new Error(`SQLite data store "${options.id}" is not an Imp query source for sync`);
    },
    registerInboundSource(storeId: string, source: SyncSourceRead) {
      inbound.set(storeId, source);
    },
    inboundSourceIds() {
      return [...inbound.keys()];
    },
    async apply(signal: SyncSignal) {
      if (applying || options.sync.isApplying()) return;
      applying = true;
      try {
        if (signal.scope.mode === "full") {
          await options.sync.ensureReadyAsync();
          return;
        }
        const { nodes, relationships } = signal.scope.changes;
        for (const id of nodes.deleted) {
          options.sync.syncNode(id);
        }
        for (const id of [...nodes.created, ...nodes.modified]) {
          options.sync.syncNode(id);
        }
        const relTouched =
          relationships.created.length +
            relationships.modified.length +
            relationships.deleted.length >
          0;
        if (relTouched) {
          options.sync.syncRelationships();
        }
      } finally {
        applying = false;
      }
    },
  };
}

/** Test stub that records applied signals (fan-out tests). */
export function createStubSyncEndpointRecording(id: string): {
  endpoint: SyncEndpoint;
  applied: SyncSignal[];
} {
  const applied: SyncSignal[] = [];
  const endpoint: SyncEndpoint = {
    id,
    capabilities: {
      kind: "unknown",
      canBeObserved: true,
      canObserve: true,
    },
    asSource() {
      return {
        executeImp() {
          return { columns: ["id"], rows: [] };
        },
      };
    },
    apply(signal) {
      applied.push(signal);
    },
  };
  return { endpoint, applied };
}
