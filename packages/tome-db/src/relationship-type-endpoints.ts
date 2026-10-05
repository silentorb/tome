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
  if (sourceTypeId && !sourceTypes.includes(sourceTypeId)) return null;

  const allowed = allowedTargetTypeIdsForEndpoint(registry, composite, endpointIndex);
  // Open opposite endpoint → empty allowed list means any target (caller treats []).
  // Keep prior behavior when typed: empty allowed means no rule / reject.
  if (allowed.length === 0 && def.endpoints[endpointIndex === 0 ? 1 : 0].typeId) {
    return null;
  }

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
  const ep0 = def.endpoints[0].typeId;
  const ep1 = def.endpoints[1].typeId;
  const matches = (types: string[], typeId: string | undefined) =>
    !typeId || types.includes(typeId);
  const forward = matches(typesA, ep0) && matches(typesB, ep1);
  const reverse = matches(typesA, ep1) && matches(typesB, ep0);
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
