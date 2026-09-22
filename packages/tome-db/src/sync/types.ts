import type {
  ExecuteImpContext,
  ImpCollectionResult,
  ImpGraph,
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
  | { mode: "partial"; changes: SyncPartialScope };

/** Imp-queryable pull surface for sync observers. */
export interface SyncSourceRead {
  executeImp(
    graph: ImpGraph,
    context?: ExecuteImpContext,
  ): ImpCollectionResult | Promise<ImpCollectionResult>;
}

export type SyncSignal = {
  source: SyncSourceRead;
  scope: SyncScope;
};

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
