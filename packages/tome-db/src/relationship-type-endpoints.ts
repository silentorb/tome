import type { RelationshipReadStore } from "./graph-store/relationship-read";
import { readStoreGetNode, readStoreListNodeIds } from "./graph-store/relationship-read";
import { typeIdsForInstance } from "./node-capabilities";
import {
  UnknownRelationshipTypeError,
  parseProjectionType,
  projectionTypeForEndpoint,
  requireRelationshipTypeId,
  allowedTargetTypeIdsForEndpoint,
  relationshipTypeRulesFromRegistry,
  hostEndpointIndex,
  projectionTypeForHostTable,
  relationSectionSupportsLinkExisting,
  resolveEndpointTypeIds,
  targetTypeIdForHostTable,
} from "tome-flatfile";
import type { RelationshipTypeDefinition, RelationshipTypesFile } from "tome-flatfile";

export {
  allowedTargetTypeIdsForEndpoint,
  relationshipTypeRulesFromRegistry,
  hostEndpointIndex,
  projectionTypeForHostTable,
  relationSectionSupportsLinkExisting,
  resolveEndpointTypeIds,
  targetTypeIdForHostTable,
};

export interface RelationshipTypeRuleEntry {
  id: string;
  sourceTypeId: string;
  type: string;
  allowedTargetTypeIds: string[];
}

export interface RelationshipTypeRuleContext {
  compositeType: string;
  type: string;
  allowedTargetTypeIds: string[];
}

/**
 * Resolve endpoint rules for an outgoing link from `sourceNodeId`.
 * `typeOrProjection` is a relationship type ULID or directed projection (`ULID:0` / `ULID:1`).
 */
export async function relationshipTypeRuleContext(
  registry: RelationshipTypesFile,
  db: RelationshipReadStore,
  sourceNodeId: string,
  typeOrProjection: string,
  contentDir?: string,
): Promise<RelationshipTypeRuleContext | null> {
  const parsed = parseProjectionType(typeOrProjection);
  let composite: string;
  let endpointIndex: 0 | 1;
  try {
    if (parsed) {
      composite = requireRelationshipTypeId(registry, parsed.relationshipTypeId);
      endpointIndex = parsed.endpointIndex;
    } else {
      composite = requireRelationshipTypeId(registry, typeOrProjection);
      endpointIndex = 0;
    }
  } catch (err) {
    if (err instanceof UnknownRelationshipTypeError) return null;
    throw err;
  }

  const def = registry.relationshipTypes[composite];
  if (!def?.endpoints) return null;

  const sourceTypes = await typeIdsForInstance(db, sourceNodeId, contentDir);
  const sourceTypeId = def.endpoints[endpointIndex].typeId;
  if (!sourceTypes.includes(sourceTypeId)) return null;

  const allowed = allowedTargetTypeIdsForEndpoint(registry, composite, endpointIndex);
  if (allowed.length === 0) return null;

  return {
    compositeType: composite,
    type: projectionTypeForEndpoint(composite, endpointIndex),
    allowedTargetTypeIds: allowed,
  };
}

export async function endpointsMatchInstances(
  def: RelationshipTypeDefinition,
  db: RelationshipReadStore,
  nodeA: string,
  nodeB: string,
  contentDir?: string,
): Promise<boolean> {
  if (!def.endpoints) return false;
  const typesA = await typeIdsForInstance(db, nodeA, contentDir);
  const typesB = await typeIdsForInstance(db, nodeB, contentDir);
  const forward =
    typesA.includes(def.endpoints[0].typeId) && typesB.includes(def.endpoints[1].typeId);
  const reverse =
    typesA.includes(def.endpoints[1].typeId) && typesB.includes(def.endpoints[0].typeId);
  return forward || reverse;
}

/** Resolve storage composite for an edge from endpoint instance types. */
export async function matchCompositeForInstances(
  registry: RelationshipTypesFile,
  db: RelationshipReadStore,
  nodeA: string,
  nodeB: string,
  contentDir?: string,
): Promise<string | null> {
  for (const [composite, def] of Object.entries(registry.relationshipTypes)) {
    if (!def.endpoints) continue;
    if (await endpointsMatchInstances(def, db, nodeA, nodeB, contentDir)) return composite;
  }
  return null;
}
