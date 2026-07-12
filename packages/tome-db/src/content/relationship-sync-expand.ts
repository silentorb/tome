import type { Properties, Relationship } from "tome-sqlite";
import { relationshipId } from "tome-sqlite";
import type { RelationshipEntry } from "tome-flatfile";
import { relationshipRecordId } from "tome-flatfile";
import type { AssociationDefinition, AssociationsFile } from "tome-flatfile";
import {
  perspectiveCountForExpansion,
  projectionTypeForEndpoint,
} from "tome-flatfile";

export interface RelationshipRecordRow {
  id: string;
  nodeA: string;
  nodeB: string;
  compositeType: string;
  properties: Properties;
}

export interface RelationshipProjectionRow {
  id: string;
  recordId: string;
  sourceNodeId: string;
  targetNodeId: string;
  type: string;
  properties: Properties;
}

export function expandRelationshipEntry(
  entry: RelationshipEntry,
  registry: AssociationsFile,
): { record: RelationshipRecordRow; projections: RelationshipProjectionRow[] } {
  const properties = entry.properties ?? {};
  const recordId = relationshipRecordId(entry.a, entry.b, entry.type);
  const record: RelationshipRecordRow = {
    id: recordId,
    nodeA: entry.a,
    nodeB: entry.b,
    compositeType: entry.type,
    properties,
  };

  const typeDef = registry.associations[entry.type];
  const projections = expandProjections(recordId, entry, typeDef, properties);

  return { record, projections };
}

/**
 * Projections bind strictly by tuple position: index 0 (`entry.a`) carries
 * `associationId:0`, index 1 (`entry.b`) carries `associationId:1`.
 * Direction comes from the authored tuple order alone.
 */
function expandProjections(
  recordId: string,
  entry: RelationshipEntry,
  typeDef: AssociationDefinition | undefined,
  properties: Properties,
): RelationshipProjectionRow[] {
  const associationId = entry.type;
  const projectionCount = perspectiveCountForExpansion(typeDef, associationId);

  if (projectionCount >= 2) {
    return [
      projectionRow(
        recordId,
        entry.a,
        entry.b,
        projectionTypeForEndpoint(associationId, 0),
        properties,
      ),
      projectionRow(
        recordId,
        entry.b,
        entry.a,
        projectionTypeForEndpoint(associationId, 1),
        properties,
      ),
    ];
  }

  return [
    projectionRow(
      recordId,
      entry.a,
      entry.b,
      projectionTypeForEndpoint(associationId, 0),
      properties,
    ),
  ];
}

function projectionRow(
  recordId: string,
  source: string,
  target: string,
  type: string,
  properties: Properties,
): RelationshipProjectionRow {
  return {
    id: relationshipId(source, type, target),
    recordId,
    sourceNodeId: source,
    targetNodeId: target,
    type,
    properties,
  };
}

export function toDomainRelationship(row: RelationshipProjectionRow): Relationship {
  return {
    id: row.id,
    sourceNodeId: row.sourceNodeId,
    targetNodeId: row.targetNodeId,
    type: row.type,
    properties: row.properties,
    recordId: row.recordId,
  };
}

export function expandAllRelationships(
  entries: RelationshipEntry[],
  registry: AssociationsFile,
): { records: RelationshipRecordRow[]; projections: RelationshipProjectionRow[] } {
  const records: RelationshipRecordRow[] = [];
  const projections: RelationshipProjectionRow[] = [];
  for (const entry of entries) {
    const expanded = expandRelationshipEntry(entry, registry);
    records.push(expanded.record);
    projections.push(...expanded.projections);
  }
  return { records, projections };
}
