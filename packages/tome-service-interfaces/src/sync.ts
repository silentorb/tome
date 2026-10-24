import type {
  ExecuteImpContext,
  ImpCollectionResult,
  ImpGraph,
  Properties,
} from "tome-graph-interfaces";

/** Ids only — sink pulls current values via `source` for create/modify. */
export type SyncIdSet = readonly string[];

export type SyncEntityOps = {
  created: SyncIdSet;
  modified: SyncIdSet;
  deleted: SyncIdSet;
};

/** Normalized partial scope: 2 entity kinds × 3 ops = 6 id sets. */
export type SyncPartialScope = {
  nodes: SyncEntityOps;
  /** Canonical relationship record ids `{a}:{b}:{type}`. */
  relationships: SyncEntityOps;
};

/** Scope of the notification — not a data payload / changeset body. */
export type SyncScope =
  | { mode: "full" }
  /** Flatfile model/relationship marker — sink runs CacheSync.syncFile(relativeName). */
  | { mode: "content"; relativeName: string }
  | { mode: "partial"; changes: SyncPartialScope };

/** Imp-queryable pull surface for sync observers. */
export interface SyncSourceRead {
  executeImp(
    graph: ImpGraph,
    context?: ExecuteImpContext,
  ): ImpCollectionResult | Promise<ImpCollectionResult>;
}

/**
 * Eager values for API mutation fan-out so sinks need not wait on durable I/O.
 * Watch/Git paths omit preview and pull via {@link SyncSourceRead}.
 */
export type SyncMutationPreview = {
  /**
   * Node id → properties bag for cache upsert (include `body` when present).
   * `null` means the node is deleted.
   */
  nodes?: Readonly<Record<string, Properties | null>>;
  /**
   * Canonical relationship record id `{a}:{b}:{type}` → entry for expand/upsert.
   * `null` means the relationship is deleted.
   */
  relationships?: Readonly<
    Record<
      string,
      | {
          a: string;
          b: string;
          type: string;
          properties?: Properties;
        }
      | null
    >
  >;
  /** Optional corpus id per node id (for multi-corpus cache upsert). */
  nodeCorpusIds?: Readonly<Record<string, string | null | undefined>>;
};

export type SyncSignal = {
  source: SyncSourceRead;
  scope: SyncScope;
  /** Present on API mutation publish; absent on FS/Git watch pulls. */
  preview?: SyncMutationPreview;
};

export type DataStoreKind =
  | "flatfile"
  | "sqlite"
  /** Queryable SoT (e.g. Postgres) — not a CacheSync sink. */
  | "queryable"
  | "fts"
  | "unknown";

export type DataStoreCapabilities = {
  canBeObserved: boolean;
  canObserve: boolean;
  kind: DataStoreKind;
};

/**
 * Sync observe/apply surface for a data store.
 * FTS backends that are sync-fed expose this; same-DB indexes may omit it.
 */
export interface SyncEndpoint {
  id: string;
  capabilities: DataStoreCapabilities;
  asSource(): SyncSourceRead;
  apply(signal: SyncSignal): void | Promise<void>;
  /** Optional: subscribe to underlying change notifications (sources). */
  subscribe?(listener: (signal: SyncSignal) => void): () => void;
}

export function emptySyncEntityOps(): SyncEntityOps {
  return { created: [], modified: [], deleted: [] };
}

export function emptySyncPartialScope(): SyncPartialScope {
  return {
    nodes: emptySyncEntityOps(),
    relationships: emptySyncEntityOps(),
  };
}

function mergeIdSets(a: SyncIdSet, b: SyncIdSet): SyncIdSet {
  if (a.length === 0) return b;
  if (b.length === 0) return a;
  return [...new Set([...a, ...b])];
}

function mergeEntityOps(a: SyncEntityOps, b: SyncEntityOps): SyncEntityOps {
  return {
    created: mergeIdSets(a.created, b.created),
    modified: mergeIdSets(a.modified, b.modified),
    deleted: mergeIdSets(a.deleted, b.deleted),
  };
}

export function mergeSyncPartialScope(
  a: SyncPartialScope,
  b: SyncPartialScope,
): SyncPartialScope {
  return {
    nodes: mergeEntityOps(a.nodes, b.nodes),
    relationships: mergeEntityOps(a.relationships, b.relationships),
  };
}

export function isSyncPartialScopeEmpty(scope: SyncPartialScope): boolean {
  const ops = [scope.nodes, scope.relationships];
  for (const op of ops) {
    if (op.created.length > 0 || op.modified.length > 0 || op.deleted.length > 0) {
      return false;
    }
  }
  return true;
}
