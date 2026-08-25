import type { Relationship } from "tome-graph-interfaces";
import { findSetEdge, setMemberIds } from "./set-membership";
import { normalizeAssociationId } from "tome-flatfile";
import {
  listRelationshipsFromSource,
  listRelationshipsToTarget,
  type RelationshipReadStore,
} from "./graph-store/relationship-read";
import { expandRelationshipEntry, toDomainRelationship } from "tome-flatfile";
import type { Properties } from "tome-graph-interfaces";

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

function mapProjectionRows(
  rows: {
    id: string;
    record_id: string;
    source_node_id: string;
    target_node_id: string;
    type: string;
    properties: string;
  }[],
): Relationship[] {
  return rows.map((row) => ({
    id: row.id,
    recordId: row.record_id,
    sourceNodeId: row.source_node_id,
    targetNodeId: row.target_node_id,
    type: row.type,
    properties: JSON.parse(row.properties) as Properties,
  }));
}

function isGraphStoreBase(store: RelationshipReadStore): store is import("tome-graph-interfaces").TomeGraphStoreBase {
  return typeof (store as import("tome-graph-interfaces").TomeGraphStoreBase).listRelationshipProjections === "function";
}

/** All projections for a composite relationship type incident to nodeId. */
export function listRelationshipsForComposite(
  db: RelationshipReadStore,
  nodeId: string,
  compositeType: string,
): Relationship[] {
  const normalized = normalizeAssociationId(compositeType);
  if (isGraphStoreBase(db)) {
    const registry = db.readAssociations();
    const seen = new Set<string>();
    const results: Relationship[] = [];
    db.forEachRelationshipRecord((entry) => {
      if (normalizeAssociationId(entry.type) !== normalized) return;
      const { projections } = expandRelationshipEntry(entry, registry);
      for (const row of projections) {
        if (row.sourceNodeId !== nodeId && row.targetNodeId !== nodeId) continue;
        const rel = toDomainRelationship(row);
        const key = rel.recordId ?? rel.id;
        if (seen.has(key)) continue;
        seen.add(key);
        results.push(rel);
      }
    });
    if (results.length > 0) return dedupeByRecordId(results);
    return listRelationshipsFromSource(db, nodeId, normalized);
  }

  const rows = db.queryAll<{
    id: string;
    record_id: string;
    source_node_id: string;
    target_node_id: string;
    type: string;
    properties: string;
  }>(
    `SELECT p.id, p.record_id, p.source_node_id, p.target_node_id, p.type, p.properties
     FROM relationship_projections p
     INNER JOIN relationship_records r ON p.record_id = r.id
     WHERE r.composite_type = ?
       AND (p.source_node_id = ? OR p.target_node_id = ?)
     ORDER BY p.id`,
    normalized,
    nodeId,
    nodeId,
  );
  const composite = dedupeByRecordId(mapProjectionRows(rows));
  if (composite.length > 0) return composite;

  return listRelationshipsFromSource(db, nodeId, normalized);
}

function dedupeByRecordId(relationships: Relationship[]): Relationship[] {
  const byRecord = new Map<string, Relationship>();
  for (const relationship of relationships) {
    const key = relationship.recordId ?? relationship.id;
    const existing = byRecord.get(key);
    if (!existing || relationship.sourceNodeId < existing.sourceNodeId) {
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

