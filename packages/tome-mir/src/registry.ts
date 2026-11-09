import type { SyncEndpoint } from "tome-service-interfaces/sync";

export type { SyncEndpoint };

/**
 * Handle-free opened store for Imp sync wiring.
 * Host session bags (flatfile stores, caches, search backends) live outside this registry.
 */
export type OpenedSyncStore = {
  id: string;
  /** Host tag; fabric does not branch on concrete store kinds. */
  kind: string;
  endpoint?: SyncEndpoint;
  close?: () => void | Promise<void>;
};

export class DataStoreRegistry {
  private readonly entries = new Map<string, OpenedSyncStore>();

  set(entry: OpenedSyncStore): void {
    if (this.entries.has(entry.id)) {
      throw new Error(`Data store "${entry.id}" is already registered`);
    }
    this.entries.set(entry.id, entry);
  }

  get(id: string): OpenedSyncStore | undefined {
    return this.entries.get(id);
  }

  require(id: string): OpenedSyncStore {
    const entry = this.entries.get(id);
    if (!entry) throw new Error(`Unknown data store id "${id}"`);
    return entry;
  }

  list(): readonly OpenedSyncStore[] {
    return [...this.entries.values()];
  }

  /** Store ids that have a sync endpoint registered. */
  idsWithEndpoint(): string[] {
    return this.list().filter((e) => e.endpoint != null).map((e) => e.id);
  }

  endpoint(id: string): SyncEndpoint {
    const entry = this.require(id);
    if (entry.endpoint == null) {
      throw new Error(`Data store "${id}" has no sync endpoint`);
    }
    return entry.endpoint;
  }
}
