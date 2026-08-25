import type { Relationship, TomeGraphStoreBase } from "tome-graph-interfaces";
import type { GraphDatabase } from "tome-sqlite";
import { expandRelationshipEntry, toDomainRelationship } from "tome-flatfile";
import { normalizeAssociationId } from "tome-flatfile";

/** Read store: graph store Base tier, or legacy cache during migration. */
export type RelationshipReadStore = TomeGraphStoreBase | GraphDatabase;

function isGraphStoreBase(store: RelationshipReadStore): store is TomeGraphStoreBase {
  return typeof (store as TomeGraphStoreBase).listRelationshipProjections === "function";
}

/** Outgoing directed projections from `sourceNodeId`, optionally filtered by projection type. */
export function listRelationshipsFromSource(
  store: RelationshipReadStore,
  sourceNodeId: string,
  type?: string,
): Relationship[] {
  if (isGraphStoreBase(store)) {
    return store.listRelationshipProjections(sourceNodeId, {
      direction: "from",
      projectionType: type,
    });
  }
  return store.listRelationshipsFromSource(sourceNodeId, type);
}

/** Incoming directed projections to `targetNodeId`, optionally filtered by projection type. */
export function listRelationshipsToTarget(
  store: RelationshipReadStore,
  targetNodeId: string,
  type?: string,
): Relationship[] {
  if (isGraphStoreBase(store)) {
    return store.listRelationshipProjections(targetNodeId, {
      direction: "to",
      projectionType: type,
    });
  }
  return store.listRelationshipsToTarget(targetNodeId, type);
}

/** All live relationship projections in the corpus (for graph export). */
export function listAllRelationshipProjections(store: RelationshipReadStore): Relationship[] {
  if (isGraphStoreBase(store)) {
    const registry = store.readAssociations();
    const seen = new Set<string>();
    const results: Relationship[] = [];
    store.forEachRelationshipRecord((entry) => {
      const { projections } = expandRelationshipEntry(entry, registry);
      for (const row of projections) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        results.push(toDomainRelationship(row));
      }
    });
    return results;
  }
  return store.listRelationshipsForGraphExport().map((row) => ({
    id: row.id,
    sourceNodeId: row.sourceNodeId,
    targetNodeId: row.targetNodeId,
    type: row.type,
    properties: {},
    recordId: undefined,
  }));
}

/** Distinct directed projection types present in live relationship data. */
export function listDistinctProjectionTypes(store: RelationshipReadStore): string[] {
  const types = new Set<string>();
  if (isGraphStoreBase(store)) {
    for (const rel of listAllRelationshipProjections(store)) {
      types.add(rel.type);
    }
  } else {
    for (const rel of store.listRelationshipsForGraphExport()) {
      types.add(rel.type);
    }
  }
  return [...types].sort();
}

/** Node lookup shared by read modules. */
export function readStoreGetNode(
  store: RelationshipReadStore,
  id: string,
): ReturnType<GraphDatabase["getNode"]> {
  if (isGraphStoreBase(store)) {
    return store.getNode(id);
  }
  return store.getNode(id);
}

export function readStoreListNodeIds(store: RelationshipReadStore): string[] {
  if (isGraphStoreBase(store)) {
    return store.listNodeIds();
  }
  return store.listNodesForGraphExport().map((row) => row.id);
}

export function readStoreIsNodeArchived(store: RelationshipReadStore, id: string): boolean {
  if (isGraphStoreBase(store)) {
    return store.isNodeArchived(id);
  }
  return store.isNodeArchived(id);
}

export function isQueryableReadStore(
  store: RelationshipReadStore,
): store is TomeGraphStoreBase & { executeImp: NonNullable<TomeGraphStoreBase["listRelationshipProjections"]> } {
  return isGraphStoreBase(store) && typeof (store as TomeGraphStoreBase & { executeImp?: unknown }).executeImp === "function";
}

/** Composite association id for a projection, when known from store data. */
export function readStoreCompositeTypeForRelationship(
  store: RelationshipReadStore,
  relationship: Relationship,
): string | null {
  if (isGraphStoreBase(store)) {
    const registry = store.readAssociations();
    let match: string | null = null;
    store.forEachRelationshipRecord((entry) => {
      if (match) return;
      const { projections } = expandRelationshipEntry(entry, registry);
      for (const row of projections) {
        if (row.id !== relationship.id) continue;
        match = normalizeAssociationId(entry.type);
        return;
      }
    });
    return match;
  }
  if (!relationship.recordId) return null;
  const record = store.getRelationshipRecord(relationship.recordId);
  return record?.compositeType ? normalizeAssociationId(record.compositeType) : null;
}

/** Incident projection count for a node (matches SQLite cache semantics). */
export function readStoreCountIncidentRelationships(
  store: RelationshipReadStore,
  nodeId: string,
): number {
  if (isGraphStoreBase(store)) {
    return store.listRelationshipProjections(nodeId, { direction: "both" }).length;
  }
  return store.countIncidentRelationships(nodeId);
}

/** Nodes whose stored body text matches a substring (backlink discovery). */
export function readStoreListNodesWithBodyLike(
  store: RelationshipReadStore,
  needle: string,
): { id: string; body: string }[] {
  const pattern = needle.replace(/^%|%$/g, "");
  if (isGraphStoreBase(store)) {
    const matches: { id: string; body: string }[] = [];
    for (const id of store.listNodeIds()) {
      const node = store.getNode(id);
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
export function readStoreGetRelationship(
  store: RelationshipReadStore,
  projectionId: string,
  endpoints?: { sourceNodeId: string; targetNodeId: string; type: string },
): Relationship | null {
  if (isGraphStoreBase(store)) {
    if (endpoints) {
      return store.findRelationshipRecord(
        endpoints.sourceNodeId,
        endpoints.targetNodeId,
        endpoints.type,
      );
    }
    for (const rel of listAllRelationshipProjections(store)) {
      if (rel.id === projectionId) return rel;
    }
    return null;
  }
  return store.getRelationship(projectionId);
}
