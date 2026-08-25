import type { RelationshipReadStore } from "./graph-store/relationship-read";
import { readStoreGetNode, readStoreListNodeIds } from "./graph-store/relationship-read";
import { typeIdsForInstance } from "./node-capabilities";
import {
  UnknownAssociationError,
  parseProjectionType,
  projectionTypeForEndpoint,
  requireAssociationId,
  allowedTargetTypeIdsForEndpoint,
  associationRulesFromRegistry,
  hostEndpointIndex,
  projectionTypeForHostTable,
  relationSectionSupportsLinkExisting,
  resolveEndpointTypeIds,
  targetTypeIdForHostTable,
} from "tome-flatfile";
import type { AssociationDefinition, AssociationsFile } from "tome-flatfile";

export {
  allowedTargetTypeIdsForEndpoint,
  associationRulesFromRegistry,
  hostEndpointIndex,
  projectionTypeForHostTable,
  relationSectionSupportsLinkExisting,
  resolveEndpointTypeIds,
  targetTypeIdForHostTable,
};

export interface AssociationRuleEntry {
  id: string;
  sourceTypeId: string;
  type: string;
  allowedTargetTypeIds: string[];
}

export interface AssociationRuleContext {
  compositeType: string;
  type: string;
  allowedTargetTypeIds: string[];
}

/**
 * Resolve endpoint rules for an outgoing link from `sourceNodeId`.
 * `typeOrProjection` is an association ULID or directed projection (`ULID:0` / `ULID:1`).
 */
export function associationRuleContext(
  registry: AssociationsFile,
  db: RelationshipReadStore,
  sourceNodeId: string,
  typeOrProjection: string,
  contentDir?: string,
): AssociationRuleContext | null {
  const parsed = parseProjectionType(typeOrProjection);
  let composite: string;
  let endpointIndex: 0 | 1;
  try {
    if (parsed) {
      composite = requireAssociationId(registry, parsed.associationId);
      endpointIndex = parsed.endpointIndex;
    } else {
      composite = requireAssociationId(registry, typeOrProjection);
      endpointIndex = 0;
    }
  } catch (err) {
    if (err instanceof UnknownAssociationError) return null;
    throw err;
  }

  const def = registry.associations[composite];
  if (!def?.endpoints) return null;

  const sourceTypes = typeIdsForInstance(db, sourceNodeId, contentDir);
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

export function endpointsMatchInstances(
  def: AssociationDefinition,
  db: RelationshipReadStore,
  nodeA: string,
  nodeB: string,
  contentDir?: string,
): boolean {
  if (!def.endpoints) return false;
  const typesA = typeIdsForInstance(db, nodeA, contentDir);
  const typesB = typeIdsForInstance(db, nodeB, contentDir);
  const forward =
    typesA.includes(def.endpoints[0].typeId) && typesB.includes(def.endpoints[1].typeId);
  const reverse =
    typesA.includes(def.endpoints[1].typeId) && typesB.includes(def.endpoints[0].typeId);
  return forward || reverse;
}

/** Resolve storage composite for an edge from endpoint instance types. */
export function matchCompositeForInstances(
  registry: AssociationsFile,
  db: RelationshipReadStore,
  nodeA: string,
  nodeB: string,
  contentDir?: string,
): string | null {
  for (const [composite, def] of Object.entries(registry.associations)) {
    if (!def.endpoints) continue;
    if (endpointsMatchInstances(def, db, nodeA, nodeB, contentDir)) return composite;
  }
  return null;
}
