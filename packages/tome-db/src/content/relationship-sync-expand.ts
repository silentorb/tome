import type { Properties, Relationship } from "../graph";
import { relationshipId } from "../graph";
import type { RelationshipEntry } from "./relationships-file";
import { relationshipRecordId } from "./relationships-file";
import type { RelationshipTypeDefinition, RelationshipTypesFile } from "./relationship-types-file";
import { perspectiveCountForExpansion } from "./relationship-types-file";

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
  registry: RelationshipTypesFile,
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

  const typeDef = registry.types[entry.type];
  const projections = expandProjections(recordId, entry, typeDef, properties);

  return { record, projections };
}

/**
 * Projections bind strictly by tuple position: index 0 (`entry.a`) carries the
 * type's `perspectives[0]` value, index 1 (`entry.b`) carries `perspectives[1]`.
 * Direction comes from the authored tuple order alone — never from node-id
 * ordering, set membership, or a directedFrom hint.
 */
function expandProjections(
  recordId: string,
  entry: RelationshipEntry,
  typeDef: RelationshipTypeDefinition | undefined,
  properties: Properties,
): RelationshipProjectionRow[] {
  const perspectives = typeDef?.perspectives ?? [entry.type];
  const projectionCount = perspectiveCountForExpansion(typeDef, entry.type);

  if (projectionCount >= 2) {
    const [typeFromA, typeFromB] = perspectives;
    return [
      projectionRow(recordId, entry.a, entry.b, typeFromA ?? entry.type, properties),
      projectionRow(recordId, entry.b, entry.a, typeFromB ?? entry.type, properties),
    ];
  }

  const localType = perspectives[0] ?? entry.type;
  return [projectionRow(recordId, entry.a, entry.b, localType, properties)];
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

export function expandAllRelationships(
  entries: RelationshipEntry[],
  registry: RelationshipTypesFile,
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

export function projectionToRelationship(row: RelationshipProjectionRow): Relationship {
  return {
    id: row.id,
    sourceNodeId: row.sourceNodeId,
    targetNodeId: row.targetNodeId,
    type: row.type,
    properties: row.properties,
  };
}
