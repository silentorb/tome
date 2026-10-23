import {
  ASSOCIATIONS_FILENAME,
  DYNAMIC_PROPERTIES_FILENAME,
  EXTENSIONS_FILENAME,
  NODE_FILE_PATTERN,
  RELATIONSHIPS_SYNC_MARKER,
  SCHEMA_FILENAME,
  SEQUENCING_FILENAME,
  TABLE_SCHEMAS_FILENAME,
  VIEWS_FILENAME,
  CORPUS_FILENAME,
  WORKSPACE_FILENAME,
} from "tome-flatfile";
import type { StoreChangeEvent, StoreChangeKind } from "tome-service-interfaces";
import { emptySyncPartialScope, type SyncScope } from "./types";

/** Map a known StoreChangeKind to the syncFile relativeName CacheSync understands. */
function contentRelativeNameForKind(kind: StoreChangeKind, path: string): string | null {
  switch (kind) {
    case "relationships":
      return RELATIONSHIPS_SYNC_MARKER;
    case "relationship-types":
      return ASSOCIATIONS_FILENAME;
    case "schema":
      return SCHEMA_FILENAME;
    case "dynamic-properties":
      return DYNAMIC_PROPERTIES_FILENAME;
    case "views":
      return VIEWS_FILENAME;
    case "table-schemas":
      return TABLE_SCHEMAS_FILENAME;
    case "workspace": {
      const base = path.includes("/") ? path.split("/").pop()! : path;
      return base === CORPUS_FILENAME ? CORPUS_FILENAME : WORKSPACE_FILENAME;
    }
    case "sequencing":
      return SEQUENCING_FILENAME;
    case "extensions":
      return EXTENSIONS_FILENAME;
    default:
      return null;
  }
}

/**
 * Map a flatfile store change event into a SyncScope.
 * Known model/relationship markers use `content` (syncFile); nodes use partial ids;
 * unknown paths stay `full` (ensureReady).
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

  const relativeName = contentRelativeNameForKind(event.kind, event.path);
  if (relativeName != null) {
    return { mode: "content", relativeName };
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
