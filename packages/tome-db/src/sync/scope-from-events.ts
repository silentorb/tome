import { NODE_FILE_PATTERN } from "tome-flatfile";
import type { StoreChangeEvent } from "tome-service-interfaces";
import { emptySyncPartialScope, type SyncScope } from "./types";

/**
 * Map a flatfile store change event into a SyncScope.
 * Coarse relationship/model markers become `full` until incremental apply exists.
 */
export function storeChangeEventToSyncScope(event: StoreChangeEvent): SyncScope {
  if (event.kind === "node") {
    const base = event.path.includes("/") ? event.path.split("/").pop()! : event.path;
    const match = NODE_FILE_PATTERN.exec(base);
    if (!match) return { mode: "full" };
    const id = base.slice(0, -3);
    // Watcher does not distinguish create vs modify; treat as modified.
    return {
      mode: "partial",
      changes: {
        ...emptySyncPartialScope(),
        nodes: { created: [], modified: [id], deleted: [] },
      },
    };
  }

  return { mode: "full" };
}

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
