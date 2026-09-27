import {
  allowedTargetTypeIdsForEndpoint as runtimeAllowedTargets,
  compileAssociationConfig,
  hostEndpointIndex as runtimeHostEndpointIndex,
  linkExistingFor,
  projectionTypeForHostTable as runtimeProjectionTypeForHostTable,
  relationshipTypeRulesFromRuntime,
  resolveEndpointTypeIds as runtimeResolveEndpointTypeIds,
  targetTypeIdForHostTable as runtimeTargetTypeIdForHostTable,
  uniqueHostEndpointIndex as runtimeUniqueHostEndpointIndex,
  type RelationshipRuntime,
  type RelationshipTypeRuleEntry,
} from "tome-ontology";
import type {
  PerspectiveLabelConfig,
  RelationshipTypeDefinition,
  RelationshipTypesFile,
} from "./content/relationship-types-file";
import {
  normalizeRelationshipTypeId,
  parseProjectionType,
  requireRelationshipTypeId,
} from "./content/relationship-types-file";

function runtimeFromRegistry(registry: RelationshipTypesFile): RelationshipRuntime {
  return compileAssociationConfig(registry);
}

export function resolveEndpointTypeIds(
  def: RelationshipTypeDefinition | undefined,
): [string, string] | null {
  if (!def?.endpoints) return null;
  return [def.endpoints[0].typeId, def.endpoints[1].typeId];
}

export function hostEndpointIndex(
  def: RelationshipTypeDefinition,
  hostTypeId: string,
): 0 | 1 | null {
  const runtime = compileAssociationConfig({
    version: 1,
    relationshipTypes: { _: def },
  });
  return runtimeHostEndpointIndex(runtime, "_", hostTypeId);
}

/** Endpoint index when host uniquely matches one side (null if both/neither). */
export function uniqueHostEndpointIndex(
  def: RelationshipTypeDefinition,
  hostTypeId: string,
): 0 | 1 | null {
  const runtime = compileAssociationConfig({
    version: 1,
    relationshipTypes: { _: def },
  });
  return runtimeUniqueHostEndpointIndex(runtime, "_", hostTypeId);
}

/** Directed projection type when linking from a row in `hostTypeId`. */
export function projectionTypeForHostTable(
  def: RelationshipTypeDefinition,
  relationshipTypeId: string,
  hostTypeId: string,
): string | null {
  const runtime = compileAssociationConfig({
    version: 1,
    relationshipTypes: { [relationshipTypeId]: def },
  });
  return runtimeProjectionTypeForHostTable(runtime, relationshipTypeId, hostTypeId);
}

/** Target type-table id for a relation column on `hostTypeId`. */
export function targetTypeIdForHostTable(
  def: RelationshipTypeDefinition,
  hostTypeId: string,
): string | null {
  const runtime = compileAssociationConfig({
    version: 1,
    relationshipTypes: { _: def },
  });
  return runtimeTargetTypeIdForHostTable(runtime, "_", hostTypeId);
}

export function allowedTargetTypeIdsForEndpoint(
  registry: RelationshipTypesFile,
  compositeType: string,
  endpointIndex: 0 | 1,
): string[] {
  return runtimeAllowedTargets(
    runtimeFromRegistry(registry),
    normalizeRelationshipTypeId(compositeType),
    endpointIndex,
  );
}

export type { RelationshipTypeRuleEntry };

/** All relationship rules implied by registry endpoint definitions. */
export function relationshipTypeRulesFromRegistry(
  registry: RelationshipTypesFile,
): RelationshipTypeRuleEntry[] {
  return relationshipTypeRulesFromRuntime(runtimeFromRegistry(registry));
}

/** Whether a relation section should show the inline link-existing control. */
export function relationSectionSupportsLinkExisting(
  registry: RelationshipTypesFile,
  typeOrProjection: string,
  compositeType?: string,
): boolean {
  const parsed = parseProjectionType(typeOrProjection);
  let composite: string;
  let endpointIndex: 0 | 1;
  try {
    if (compositeType) {
      composite = requireRelationshipTypeId(registry, compositeType);
      endpointIndex = parsed?.endpointIndex ?? 0;
    } else if (parsed) {
      composite = requireRelationshipTypeId(registry, parsed.relationshipTypeId);
      endpointIndex = parsed.endpointIndex;
    } else {
      composite = requireRelationshipTypeId(registry, typeOrProjection);
      endpointIndex = 0;
    }
  } catch {
    return false;
  }
  const runtime = runtimeFromRegistry(registry);
  return linkExistingFor(runtime, { predicateId: composite, endpointIndex });
}

/** @internal re-export for callers that still import PerspectiveLabelConfig here */
export type { PerspectiveLabelConfig };

/** Resolve endpoints via BR when a full registry is available. */
export function resolveEndpointTypeIdsFromRegistry(
  registry: RelationshipTypesFile,
  predicateId: string,
): [string, string] | null {
  return runtimeResolveEndpointTypeIds(
    runtimeFromRegistry(registry),
    normalizeRelationshipTypeId(predicateId),
  );
}
