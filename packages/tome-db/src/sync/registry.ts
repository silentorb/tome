import type { TomeDataStore, TomeQueryCache } from "tome-service-interfaces";
import type { TomeGraphStoreQueryable } from "tome-graph-interfaces";
import type { SyncSourceRead, SyncSignal } from "./types";

export type DataStoreKind = "flatfile" | "sqlite" | "fts" | "unknown";

export type DataStoreCapabilities = {
  canBeObserved: boolean;
  canObserve: boolean;
  kind: DataStoreKind;
};

export interface SyncEndpoint {
  id: string;
  capabilities: DataStoreCapabilities;
  asSource(): SyncSourceRead;
  apply(signal: SyncSignal): void | Promise<void>;
  /** Optional: subscribe to underlying change notifications (sources). */
  subscribe?(listener: (signal: SyncSignal) => void): () => void;
}

export type OpenedDataStore =
  | {
      id: string;
      kind: "flatfile";
      store: TomeDataStore;
      queryable: TomeGraphStoreQueryable;
      endpoint: SyncEndpoint;
    }
  | {
      id: string;
      kind: "sqlite";
      cache: TomeQueryCache;
      endpoint: SyncEndpoint;
    }
  | {
      id: string;
      kind: "fts";
      endpoint: SyncEndpoint;
      search: import("tome-interfaces/search").TomeSearch;
      close: () => void;
    }
  | {
      id: string;
      kind: "unknown";
      endpoint: SyncEndpoint;
    };

export class DataStoreRegistry {
  private readonly entries = new Map<string, OpenedDataStore>();

  set(entry: OpenedDataStore): void {
    if (this.entries.has(entry.id)) {
      throw new Error(`Data store "${entry.id}" is already registered`);
    }
    this.entries.set(entry.id, entry);
  }

  get(id: string): OpenedDataStore | undefined {
    return this.entries.get(id);
  }

  require(id: string): OpenedDataStore {
    const entry = this.entries.get(id);
    if (!entry) throw new Error(`Unknown data store id "${id}"`);
    return entry;
  }

  list(): readonly OpenedDataStore[] {
    return [...this.entries.values()];
  }

  flatfileStores(): TomeDataStore[] {
    return this.list()
      .filter((e): e is Extract<OpenedDataStore, { kind: "flatfile" }> => e.kind === "flatfile")
      .map((e) => e.store);
  }

  sqliteStores(): Array<{ id: string; cache: TomeQueryCache }> {
    return this.list()
      .filter((e): e is Extract<OpenedDataStore, { kind: "sqlite" }> => e.kind === "sqlite")
      .map((e) => ({ id: e.id, cache: e.cache }));
  }

  endpoint(id: string): SyncEndpoint {
    return this.require(id).endpoint;
  }
}
