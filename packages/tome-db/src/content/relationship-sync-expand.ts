import type { Properties, Relationship } from "../graph";
import { relationshipId } from "../graph";
import type { RelationshipEntry } from "./relationships-file";
import { relationshipRecordId } from "./relationships-file";
import type { RelationshipTypesFile } from "./relationship-types-file";

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
  const projections: RelationshipProjectionRow[] = [];

  if (typeDef?.bidirectional && typeDef.perspectives.length >= 2) {
    const [typeFromA, typeFromB] = typeDef.perspectives;
    projections.push(
      projectionRow(recordId, entry.a, entry.b, typeFromA!, properties),
      projectionRow(recordId, entry.b, entry.a, typeFromB!, properties),
    );
  } else {
    const localType = typeDef?.perspectives[0] ?? entry.type;
    let source: string;
    let target: string;
    if (entry.directedFrom) {
      source = entry.directedFrom;
      target = source === entry.a ? entry.b : entry.a;
    } else {
      source = entry.a;
      target = entry.b;
    }
    projections.push(projectionRow(recordId, source, target, localType, properties));
  }

  return { record, projections };
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

export function localTypeForProjection(
  registry: RelationshipTypesFile,
  compositeType: string,
  sourceNodeId: string,
  entry: RelationshipEntry,
): string | null {
  const typeDef = registry.types[compositeType];
  if (!typeDef) return compositeType;
  if (!typeDef.bidirectional) return typeDef.perspectives[0] ?? compositeType;
  if (sourceNodeId === entry.a) return typeDef.perspectives[0] ?? null;
  if (sourceNodeId === entry.b) return typeDef.perspectives[1] ?? null;
  return null;
}
