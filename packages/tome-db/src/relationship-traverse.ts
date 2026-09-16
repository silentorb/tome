import type { Relationship } from "tome-graph-interfaces";
import { findSetEdge, setMemberIds } from "./set-membership";
import { normalizeAssociationId } from "tome-flatfile";
import {
  listRelationshipsFromSource,
  listRelationshipsToTarget,
  type RelationshipReadStore,
} from "./graph-store/relationship-read";
import { expandRelationshipEntry, toDomainRelationship } from "tome-flatfile";

export function rowBelongsToDatabase(
  db: RelationshipReadStore,
  rowId: string,
  databaseId: string,
  contentDir?: string,
): boolean {
  return findSetEdge(db, rowId, databaseId, contentDir) !== null;
}

/** Keep incident edges when row is a member of the viewing database. */
export function filterRelationshipsByRowDatabaseContext(
  db: RelationshipReadStore,
  rowId: string,
  databaseId: string,
  relationships: Relationship[],
  contentDir?: string,
): Relationship[] {
  if (!rowBelongsToDatabase(db, rowId, databaseId, contentDir)) return [];
  return relationships;
}

function uniqueRelationships(relationships: Relationship[]): Relationship[] {
  const seen = new Set<string>();
  const unique: Relationship[] = [];
  for (const relationship of relationships) {
    if (seen.has(relationship.id)) continue;
    seen.add(relationship.id);
    unique.push(relationship);
  }
  return unique;
}

function hasGetRelationship(
  store: RelationshipReadStore,
): store is RelationshipReadStore & {
  getRelationship: (id: string) => Relationship | null;
} {
  return typeof (store as { getRelationship?: unknown }).getRelationship === "function";
}

function isGraphStoreBase(store: RelationshipReadStore): store is import("tome-graph-interfaces").TomeGraphStoreBase {
  return typeof (store as import("tome-graph-interfaces").TomeGraphStoreBase).listRelationshipProjections === "function";
}

function hasQueryAll(
  store: RelationshipReadStore,
): store is RelationshipReadStore & {
  queryAll: <T extends Record<string, unknown>>(sql: string, ...params: unknown[]) => T[];
} {
  return typeof (store as { queryAll?: unknown }).queryAll === "function";
}

/** All projections for a composite relationship type incident to nodeId. */
export function listRelationshipsForComposite(
  db: RelationshipReadStore,
  nodeId: string,
  compositeType: string,
): Relationship[] {
  const normalized = normalizeAssociationId(compositeType);

  // Prefer indexed SQLite when available (ComposedGraphStore / GraphDatabase).
  // Base-tier forEach over flatfile re-scans every relationship shard.
  if (hasQueryAll(db) && hasGetRelationship(db)) {
    const rows = db.queryAll<{ id: string }>(
      `SELECT p.id
       FROM relationship_projections p
       INNER JOIN relationship_records r ON p.record_id = r.id
       WHERE r.composite_type = ?
         AND (p.source_node_id = ? OR p.target_node_id = ?)
       ORDER BY p.id`,
      normalized,
      nodeId,
      nodeId,
    );
    const hydrated: Relationship[] = [];
    for (const row of rows) {
      const relationship = db.getRelationship(row.id);
      if (relationship) hydrated.push(relationship);
    }
    const composite = dedupeByRecordId(hydrated, nodeId);
    if (composite.length > 0) return composite;
    return listRelationshipsFromSource(db, nodeId, normalized);
  }

  if (hasQueryAll(db)) {
    // Cache without getRelationship: fall through to projection list APIs.
    return listRelationshipsFromSource(db, nodeId, normalized);
  }

  if (isGraphStoreBase(db)) {
    const registry = db.readAssociations();
    const results: Relationship[] = [];
    db.forEachRelationshipRecord((entry) => {
      if (normalizeAssociationId(entry.type) !== normalized) return;
      const { projections } = expandRelationshipEntry(entry, registry);
      for (const row of projections) {
        if (row.sourceNodeId !== nodeId && row.targetNodeId !== nodeId) continue;
        results.push(toDomainRelationship(row));
      }
    });
    if (results.length > 0) return dedupeByRecordId(results, nodeId);
    return listRelationshipsFromSource(db, nodeId, normalized);
  }

  return listRelationshipsFromSource(db, nodeId, normalized);
}

/**
 * One projection per relationship record. When `preferredSourceNodeId` is set
 * (composite listing for a node), keep that node's outgoing projection so
 * directed filters such as `filterByOutgoingPerspective` see every link.
 * Otherwise fall back to lexicographically smaller sourceNodeId.
 */
function dedupeByRecordId(
  relationships: Relationship[],
  preferredSourceNodeId?: string,
): Relationship[] {
  const byRecord = new Map<string, Relationship>();
  for (const relationship of relationships) {
    const key = relationship.recordId ?? relationship.id;
    const existing = byRecord.get(key);
    if (!existing) {
      byRecord.set(key, relationship);
      continue;
    }
    if (preferredSourceNodeId) {
      const nextOutgoing = relationship.sourceNodeId === preferredSourceNodeId;
      const existingOutgoing = existing.sourceNodeId === preferredSourceNodeId;
      if (nextOutgoing && !existingOutgoing) {
        byRecord.set(key, relationship);
      }
      continue;
    }
    if (relationship.sourceNodeId < existing.sourceNodeId) {
      byRecord.set(key, relationship);
    }
  }
  return [...byRecord.values()];
}

export function otherEndpoint(relationship: Relationship, nodeId: string): string {
  return relationship.sourceNodeId === nodeId
    ? relationship.targetNodeId
    : relationship.sourceNodeId;
}

export function relatedNodeIds(
  db: RelationshipReadStore,
  nodeId: string,
  compositeType: string,
): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const relationship of listRelationshipsForComposite(db, nodeId, compositeType)) {
    const other = otherEndpoint(relationship, nodeId);
    if (seen.has(other)) continue;
    seen.add(other);
    ids.push(other);
  }
  return ids;
}

export function firstRelatedNodeId(
  db: RelationshipReadStore,
  nodeId: string,
  compositeType: string,
): string | null {
  const relationships = listRelationshipsForComposite(db, nodeId, compositeType);
  return relationships[0] ? otherEndpoint(relationships[0], nodeId) : null;
}

function databaseMemberIds(db: RelationshipReadStore, databaseId: string, contentDir?: string): Set<string> {
  return new Set(setMemberIds(db, databaseId, contentDir));
}

/** Incident relationships whose opposite endpoint belongs to targetDatabaseId. */
export function listRelationshipsToDatabaseMembers(
  db: RelationshipReadStore,
  nodeId: string,
  targetDatabaseId: string,
  contentDir?: string,
): Relationship[] {
  const members = databaseMemberIds(db, targetDatabaseId, contentDir);
  const incident = uniqueRelationships([
    ...listRelationshipsFromSource(db, nodeId),
    ...listRelationshipsToTarget(db, nodeId),
  ]);
  return dedupeByRecordId(
    incident.filter((relationship) => {
      const other = otherEndpoint(relationship, nodeId);
      return members.has(other);
    }),
  );
}

