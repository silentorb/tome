import type { TomeDataStore, TomeQueryCache } from "tome-service-interfaces";
import type {
  DataStoreCapabilities,
  DataStoreKind,
  SyncEndpoint,
} from "tome-service-interfaces/sync";
import type { TomeGraphStoreQueryable } from "tome-graph-interfaces";
import type { TomeSearch } from "tome-interfaces/search";

export type { DataStoreKind, DataStoreCapabilities, SyncEndpoint };

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
      /** Present when the FTS backend is sync-fed; omitted for same-DB indexes. */
      endpoint?: SyncEndpoint;
      search: TomeSearch;
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

  /** Sync-capable FTS store ids (same-DB FTS without an endpoint is omitted). */
  ftsStoreIdsWithSync(): string[] {
    return this.list()
      .filter(
        (e): e is Extract<OpenedDataStore, { kind: "fts" }> =>
          e.kind === "fts" && e.endpoint != null,
      )
      .map((e) => e.id);
  }

  endpoint(id: string): SyncEndpoint {
    const entry = this.require(id);
    if (entry.kind === "fts" && entry.endpoint == null) {
      throw new Error(`Data store "${id}" has no sync endpoint`);
    }
    if (!("endpoint" in entry) || entry.endpoint == null) {
      throw new Error(`Data store "${id}" has no sync endpoint`);
    }
    return entry.endpoint;
  }
}
