import type { Node, Relationship, TomeGraphStoreBase } from "tome-graph-interfaces";
import type {
  RelationshipProjectionWindowQuery,
  RelationshipProjectionWindowResult,
  MemberPageQuery,
  MemberPageResult,
  DistinctSetMemberScopeQuery,
  DistinctSetMemberScopeRow,
  ComposedGroupHeadersQuery,
  ComposedGroupHeaderRow,
  TomeQueryCache,
} from "tome-service-interfaces";
import { expandRelationshipEntry, toDomainRelationship } from "tome-flatfile";
import { normalizeRelationshipTypeId } from "tome-flatfile";

/** Read store: graph store Base tier, or legacy cache during migration. */
export type RelationshipReadStore = TomeGraphStoreBase | TomeQueryCache;

export function isGraphStoreBase(store: RelationshipReadStore): store is TomeGraphStoreBase {
  // Do not probe arbitrary methods — async cache proxies return functions for any key.
  return (
    typeof (store as TomeGraphStoreBase).contentDir === "string" &&
    "capabilities" in store
  );
}

/**
 * SQLite query cache when available (raw `TomeQueryCache` or `ComposedGraphStore.queryCache`).
 * Pure flatfile Base stores return null — flatfile is exempt from SQL windowing.
 */
export function getQueryCache(store: RelationshipReadStore): TomeQueryCache | null {
  if (!isGraphStoreBase(store)) {
    return store;
  }
  const withCache = store as TomeGraphStoreBase & { queryCache?: TomeQueryCache };
  if (
    withCache.queryCache &&
    typeof withCache.queryCache.listRelationshipsFromSource === "function"
  ) {
    return withCache.queryCache;
  }
  return null;
}

/** Outgoing directed projections from `sourceNodeId`, optionally filtered by projection type. */
export async function listRelationshipsFromSource(
  store: RelationshipReadStore,
  sourceNodeId: string,
  type?: string,
): Promise<Relationship[]> {
  if (isGraphStoreBase(store)) {
    return store.listRelationshipProjections(sourceNodeId, {
      direction: "from",
      projectionType: type,
    });
  }
  return store.listRelationshipsFromSource(sourceNodeId, type);
}

/** Distinct outgoing projection types for a source node (SQL when cache present). */
export async function listOutgoingProjectionTypes(
  store: RelationshipReadStore,
  sourceNodeId: string,
): Promise<string[]> {
  const cache = getQueryCache(store);
  if (cache && typeof cache.listOutgoingProjectionTypes === "function") {
    return cache.listOutgoingProjectionTypes(sourceNodeId);
  }
  const types = new Set<string>();
  for (const rel of await listRelationshipsFromSource(store, sourceNodeId)) {
    types.add(rel.type);
  }
  return [...types].sort((a, b) => a.localeCompare(b));
}

/** Distinct edge property keys for one outgoing perspective (SQL when cache present). */
export async function listOutgoingProjectionPropertyKeys(
  store: RelationshipReadStore,
  sourceNodeId: string,
  type: string,
): Promise<string[]> {
  const cache = getQueryCache(store);
  if (cache && typeof cache.listOutgoingProjectionPropertyKeys === "function") {
    return cache.listOutgoingProjectionPropertyKeys(sourceNodeId, type);
  }
  const keys = new Set<string>();
  for (const rel of await listRelationshipsFromSource(store, sourceNodeId, type)) {
    for (const key of Object.keys(rel.properties)) {
      if (key === "ordinal" || key === "order" || key === "row_name") continue;
      keys.add(key);
    }
  }
  return [...keys].sort((a, b) => a.localeCompare(b));
}

/** Ordered SQL window of outgoing projections; throws if no query cache. */
export async function listRelationshipsFromSourceWindow(
  store: RelationshipReadStore,
  sourceNodeId: string,
  type: string,
  query?: RelationshipProjectionWindowQuery,
): Promise<RelationshipProjectionWindowResult> {
  const cache = getQueryCache(store);
  if (!cache || typeof cache.listRelationshipsFromSourceWindow !== "function") {
    throw new Error("listRelationshipsFromSourceWindow requires a SQLite query cache");
  }
  return cache.listRelationshipsFromSourceWindow(sourceNodeId, type, query);
}

/** Ordered SQL window of set membership edges; throws if no query cache. */
export async function listMemberPage(
  store: RelationshipReadStore,
  setId: string,
  query: MemberPageQuery,
): Promise<MemberPageResult> {
  const cache = getQueryCache(store);
  if (!cache || typeof cache.listMemberPage !== "function") {
    throw new Error("listMemberPage requires a SQLite query cache");
  }
  return cache.listMemberPage(setId, query);
}

/** Distinct member node ids for a set; throws if no query cache. */
export async function listMemberPageNodeIds(
  store: RelationshipReadStore,
  setId: string,
  query: MemberPageQuery,
): Promise<string[]> {
  const cache = getQueryCache(store);
  if (!cache || typeof cache.listMemberPageNodeIds !== "function") {
    throw new Error("listMemberPageNodeIds requires a SQLite query cache");
  }
  return cache.listMemberPageNodeIds(setId, query);
}

/** Related target node ids for an outgoing projection; throws if no query cache. */
export async function listRelatedTargetNodeIds(
  store: RelationshipReadStore,
  sourceNodeId: string,
  type: string,
): Promise<string[]> {
  const cache = getQueryCache(store);
  if (!cache || typeof cache.listRelatedTargetNodeIds !== "function") {
    throw new Error("listRelatedTargetNodeIds requires a SQLite query cache");
  }
  return cache.listRelatedTargetNodeIds(sourceNodeId, type);
}

/** Outgoing edges for specific targets; throws if no query cache. */
export async function listRelationshipsFromSourceForTargetIds(
  store: RelationshipReadStore,
  sourceNodeId: string,
  type: string,
  targetIds: readonly string[],
): Promise<Relationship[]> {
  const cache = getQueryCache(store);
  if (!cache || typeof cache.listRelationshipsFromSourceForTargetIds !== "function") {
    throw new Error("listRelationshipsFromSourceForTargetIds requires a SQLite query cache");
  }
  return cache.listRelationshipsFromSourceForTargetIds(sourceNodeId, type, targetIds);
}

/** Distinct scope ids among set members; throws if no query cache. */
export async function listDistinctSetMemberScopeIds(
  store: RelationshipReadStore,
  setId: string,
  query: DistinctSetMemberScopeQuery,
): Promise<DistinctSetMemberScopeRow[]> {
  const cache = getQueryCache(store);
  if (!cache || typeof cache.listDistinctSetMemberScopeIds !== "function") {
    throw new Error("listDistinctSetMemberScopeIds requires a SQLite query cache");
  }
  return cache.listDistinctSetMemberScopeIds(setId, query);
}

/** Composed group headers; throws if no query cache. */
export async function listComposedGroupHeaders(
  store: RelationshipReadStore,
  query: ComposedGroupHeadersQuery,
): Promise<ComposedGroupHeaderRow[]> {
  const cache = getQueryCache(store);
  if (!cache || typeof cache.listComposedGroupHeaders !== "function") {
    throw new Error("listComposedGroupHeaders requires a SQLite query cache");
  }
  return cache.listComposedGroupHeaders(query);
}

/** Incoming directed projections to `targetNodeId`, optionally filtered by projection type. */
export async function listRelationshipsToTarget(
  store: RelationshipReadStore,
  targetNodeId: string,
  type?: string,
): Promise<Relationship[]> {
  if (isGraphStoreBase(store)) {
    return store.listRelationshipProjections(targetNodeId, {
      direction: "to",
      projectionType: type,
    });
  }
  return store.listRelationshipsToTarget(targetNodeId, type);
}

/** All live relationship projections in the corpus (for graph export). */
export async function listAllRelationshipProjections(store: RelationshipReadStore): Promise<Relationship[]> {
  if (isGraphStoreBase(store)) {
    const registry = await store.readRelationshipTypes();
    const seen = new Set<string>();
    const results: Relationship[] = [];
    await store.forEachRelationshipRecord((entry) => {
      const { projections } = expandRelationshipEntry(entry, registry);
      for (const row of projections) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        results.push(toDomainRelationship(row));
      }
    });
    return results;
  }
  return (await store.listRelationshipsForGraphExport()).map((row) => ({
    id: row.id,
    sourceNodeId: row.sourceNodeId,
    targetNodeId: row.targetNodeId,
    type: row.type,
    properties: {},
    recordId: undefined,
  }));
}

/** Distinct directed projection types present in live relationship data. */
export async function listDistinctProjectionTypes(store: RelationshipReadStore): Promise<string[]> {
  const types = new Set<string>();
  if (isGraphStoreBase(store)) {
    for (const rel of await listAllRelationshipProjections(store)) {
      types.add(rel.type);
    }
  } else {
    for (const rel of await store.listRelationshipsForGraphExport()) {
      types.add(rel.type);
    }
  }
  return [...types].sort();
}

/** Node ids that appear as source or target of at least one projection of `type`. */
export async function listNodeIdsForProjectionType(
  store: RelationshipReadStore,
  projectionType: string,
): Promise<string[]> {
  const trimmed = projectionType.trim();
  if (!trimmed) return [];

  if (
    !isGraphStoreBase(store) &&
    typeof (store as TomeQueryCache).listNodeIdsForProjectionType === "function"
  ) {
    return (store as TomeQueryCache).listNodeIdsForProjectionType(trimmed);
  }

  const ids = new Set<string>();
  for (const rel of await listAllRelationshipProjections(store)) {
    if (rel.type !== trimmed) continue;
    ids.add(rel.sourceNodeId);
    ids.add(rel.targetNodeId);
  }
  return [...ids];
}

/** Node ids that appear as source of at least one projection of `type`. */
export async function listSourceNodeIdsForProjectionType(
  store: RelationshipReadStore,
  projectionType: string,
): Promise<string[]> {
  const trimmed = projectionType.trim();
  if (!trimmed) return [];

  if (
    !isGraphStoreBase(store) &&
    typeof (store as TomeQueryCache).listSourceNodeIdsForProjectionType === "function"
  ) {
    return (store as TomeQueryCache).listSourceNodeIdsForProjectionType(trimmed);
  }

  const ids = new Set<string>();
  for (const rel of await listAllRelationshipProjections(store)) {
    if (rel.type !== trimmed) continue;
    ids.add(rel.sourceNodeId);
  }
  return [...ids];
}

/** Node lookup shared by read modules. */
export async function readStoreGetNode(
  store: RelationshipReadStore,
  id: string,
): Promise<Node | null> {
  if (isGraphStoreBase(store)) {
    return store.getNode(id);
  }
  return store.getNode(id);
}

export async function readStoreListNodeIds(store: RelationshipReadStore): Promise<string[]> {
  if (isGraphStoreBase(store)) {
    return store.listNodeIds();
  }
  return (await store.listNodesForGraphExport()).map((row) => row.id);
}

export async function readStoreIsNodeArchived(store: RelationshipReadStore, id: string): Promise<boolean> {
  if (isGraphStoreBase(store)) {
    return store.isNodeArchived(id);
  }
  return store.isNodeArchived(id);
}

export function isQueryableReadStore(
  store: RelationshipReadStore,
): store is import("tome-graph-interfaces").TomeGraphStoreQueryable {
  return (
    isGraphStoreBase(store) &&
    typeof (store as import("tome-graph-interfaces").TomeGraphStoreQueryable).executeImp ===
      "function"
  );
}

/** Composite association id for a projection, when known from store data. */
export async function readStoreCompositeTypeForRelationship(
  store: RelationshipReadStore,
  relationship: Relationship,
): Promise<string | null> {
  if (isGraphStoreBase(store)) {
    const registry = await store.readRelationshipTypes();
    let match: string | null = null;
    await store.forEachRelationshipRecord((entry) => {
      if (match) return;
      const { projections } = expandRelationshipEntry(entry, registry);
      for (const row of projections) {
        if (row.id !== relationship.id) continue;
        match = normalizeRelationshipTypeId(entry.type);
        return;
      }
    });
    return match;
  }
  if (!relationship.recordId) return null;
  const record = await store.getRelationshipRecord(relationship.recordId);
  return record?.compositeType ? normalizeRelationshipTypeId(record.compositeType) : null;
}

/** Incident projection count for a node (matches SQLite cache semantics). */
export async function readStoreCountIncidentRelationships(
  store: RelationshipReadStore,
  nodeId: string,
): Promise<number> {
  if (isGraphStoreBase(store)) {
    return (await store.listRelationshipProjections(nodeId, { direction: "both" })).length;
  }
  return store.countIncidentRelationships(nodeId);
}

function hasListNodesWithBodyLike(
  store: RelationshipReadStore,
): store is RelationshipReadStore & {
  listNodesWithBodyLike: (pattern: string) => Promise<{ id: string; body: string }[]>;
} {
  return typeof (store as { listNodesWithBodyLike?: unknown }).listNodesWithBodyLike === "function";
}

/** Nodes whose stored body text matches a substring (backlink discovery). */
export async function readStoreListNodesWithBodyLike(
  store: RelationshipReadStore,
  needle: string,
): Promise<{ id: string; body: string }[]> {
  if (isGraphStoreBase(store)) {
    // ComposedGraphStore exposes listNodesWithBodyLike via the SQLite cache.
    if (hasListNodesWithBodyLike(store)) {
      return store.listNodesWithBodyLike(needle);
    }
    const pattern = needle.replace(/^%|%$/g, "");
    const matches: { id: string; body: string }[] = [];
    for (const id of await store.listNodeIds()) {
      const node = await store.getNode(id);
      if (!node) continue;
      const body = typeof node.properties.body === "string" ? node.properties.body : "";
      if (body.includes(pattern)) {
        matches.push({ id, body });
      }
    }
    return matches;
  }
  return store.listNodesWithBodyLike(needle);
}

/** Projection lookup by id (legacy cache) or endpoint match on graph store. */
export async function readStoreGetRelationship(
  store: RelationshipReadStore,
  projectionId: string,
  endpoints?: { sourceNodeId: string; targetNodeId: string; type: string },
): Promise<Relationship | null> {
  if (isGraphStoreBase(store)) {
    if (endpoints) {
      return store.findRelationshipRecord(
        endpoints.sourceNodeId,
        endpoints.targetNodeId,
        endpoints.type,
      );
    }
    for (const rel of await listAllRelationshipProjections(store)) {
      if (rel.id === projectionId) return rel;
    }
    return null;
  }
  return store.getRelationship(projectionId);
}
