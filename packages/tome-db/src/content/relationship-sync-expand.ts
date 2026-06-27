import type { Properties, Relationship } from "../graph";
import { relationshipId } from "../graph";
import type { RelationshipEntry } from "./relationships-file";
import { relationshipRecordId } from "./relationships-file";
import type { RelationshipTypeDefinition, RelationshipTypesFile } from "./relationship-types-file";
import { perspectiveCountForExpansion } from "./relationship-types-file";

export const SET_MEMBERSHIP_STORAGE_TYPE = "member_of";
export const SET_MEMBER_PERSPECTIVE = "member_of";
export const SET_MEMBERS_PERSPECTIVE = "members";

export interface RelationshipExpansionContext {
  /** Type-table and archive hub node ids — used to orient member_of / members projections. */
  setNodeIds?: ReadonlySet<string>;
}

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

export function resolveSetMembershipEndpoints(
  entry: RelationshipEntry,
  setNodeIds?: ReadonlySet<string>,
): { memberId: string; setId: string } | null {
  if (entry.type !== SET_MEMBERSHIP_STORAGE_TYPE) return null;

  if (setNodeIds) {
    const aIsSet = setNodeIds.has(entry.a);
    const bIsSet = setNodeIds.has(entry.b);
    if (aIsSet && !bIsSet) return { memberId: entry.b, setId: entry.a };
    if (bIsSet && !aIsSet) return { memberId: entry.a, setId: entry.b };
  }

  if (entry.directedFrom) {
    const memberId = entry.directedFrom;
    const setId = memberId === entry.a ? entry.b : entry.a;
    return { memberId, setId };
  }

  return null;
}

export function expandRelationshipEntry(
  entry: RelationshipEntry,
  registry: RelationshipTypesFile,
  context: RelationshipExpansionContext = {},
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
  const projections = expandProjections(recordId, entry, typeDef, properties, context);

  return { record, projections };
}

function expandProjections(
  recordId: string,
  entry: RelationshipEntry,
  typeDef: RelationshipTypeDefinition | undefined,
  properties: Properties,
  context: RelationshipExpansionContext,
): RelationshipProjectionRow[] {
  const perspectives = typeDef?.perspectives ?? [entry.type];
  const projectionCount = perspectiveCountForExpansion(typeDef, entry.type);

  if (entry.type === SET_MEMBERSHIP_STORAGE_TYPE && projectionCount >= 2) {
    const endpoints = resolveSetMembershipEndpoints(entry, context.setNodeIds);
    if (endpoints) {
      const { memberId, setId } = endpoints;
      return [
        projectionRow(recordId, memberId, setId, SET_MEMBER_PERSPECTIVE, properties),
        projectionRow(recordId, setId, memberId, SET_MEMBERS_PERSPECTIVE, properties),
      ];
    }
  }

  if (projectionCount >= 2) {
    const [typeFromA, typeFromB] = perspectives;
    return [
      projectionRow(recordId, entry.a, entry.b, typeFromA!, properties),
      projectionRow(recordId, entry.b, entry.a, typeFromB!, properties),
    ];
  }

  const localType = perspectives[0] ?? entry.type;
  let source = entry.a;
  let target = entry.b;
  if (entry.directedFrom) {
    source = entry.directedFrom;
    target = source === entry.a ? entry.b : entry.a;
  }
  return [projectionRow(recordId, source, target, localType, properties)];
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
  context: RelationshipExpansionContext = {},
): { records: RelationshipRecordRow[]; projections: RelationshipProjectionRow[] } {
  const records: RelationshipRecordRow[] = [];
  const projections: RelationshipProjectionRow[] = [];
  for (const entry of entries) {
    const expanded = expandRelationshipEntry(entry, registry, context);
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
  if (perspectiveCountForExpansion(typeDef, compositeType) < 2) {
    return typeDef.perspectives[0] ?? compositeType;
  }
  if (sourceNodeId === entry.a) return typeDef.perspectives[0] ?? null;
  if (sourceNodeId === entry.b) return typeDef.perspectives[1] ?? null;
  return null;
}
