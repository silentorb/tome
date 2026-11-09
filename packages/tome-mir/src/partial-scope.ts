import {
  emptySyncPartialScope,
  type SyncScope,
} from "tome-service-interfaces/sync";

export function syncScopeForNodeUpsert(id: string, existed: boolean): SyncScope {
  return {
    mode: "partial",
    changes: {
      ...emptySyncPartialScope(),
      nodes: existed
        ? { created: [], modified: [id], deleted: [] }
        : { created: [id], modified: [], deleted: [] },
    },
  };
}

export function syncScopeForNodeDelete(id: string): SyncScope {
  return {
    mode: "partial",
    changes: {
      ...emptySyncPartialScope(),
      nodes: { created: [], modified: [], deleted: [id] },
    },
  };
}

export function syncScopeForRelationshipUpsert(id: string, existed: boolean): SyncScope {
  return {
    mode: "partial",
    changes: {
      ...emptySyncPartialScope(),
      relationships: existed
        ? { created: [], modified: [id], deleted: [] }
        : { created: [id], modified: [], deleted: [] },
    },
  };
}

export function syncScopeForRelationshipDelete(id: string): SyncScope {
  return {
    mode: "partial",
    changes: {
      ...emptySyncPartialScope(),
      relationships: { created: [], modified: [], deleted: [id] },
    },
  };
}
