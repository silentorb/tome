import type {
  PerspectiveLabelConfig,
  AssociationDefinition,
  AssociationsFile,
} from "./content/associations-file";
import {
  normalizeAssociationId,
  parseProjectionType,
  perspectiveConfigAt,
  perspectiveLinkExisting,
  projectionTypeForEndpoint,
  requireAssociationId,
} from "./content/associations-file";

function linkExistingForEndpoint(
  def: AssociationDefinition,
  endpointIndex: 0 | 1,
): boolean | undefined {
  const fromLabel = perspectiveLinkExisting(perspectiveConfigAt(def, endpointIndex));
  if (fromLabel !== undefined) return fromLabel;
  return def.linkExisting;
}

export function resolveEndpointTypeIds(
  def: AssociationDefinition | undefined,
): [string, string] | null {
  if (!def?.endpoints) return null;
  return [def.endpoints[0].typeId, def.endpoints[1].typeId];
}

export function hostEndpointIndex(
  def: AssociationDefinition,
  hostTypeId: string,
): 0 | 1 | null {
  if (!def.endpoints) return null;
  if (def.endpoints[0].typeId === hostTypeId) return 0;
  if (def.endpoints[1].typeId === hostTypeId) return 1;
  return null;
}

/** Directed projection type when linking from a row in `hostTypeId`. */
export function projectionTypeForHostTable(
  def: AssociationDefinition,
  associationId: string,
  hostTypeId: string,
): string | null {
  const index = hostEndpointIndex(def, hostTypeId);
  if (index === null) return null;
  return projectionTypeForEndpoint(associationId, index);
}

/** Target type-table id for a relation column on `hostTypeId`. */
export function targetTypeIdForHostTable(
  def: AssociationDefinition,
  hostTypeId: string,
): string | null {
  const index = hostEndpointIndex(def, hostTypeId);
  if (index === null || !def.endpoints) return null;
  const other: 0 | 1 = index === 0 ? 1 : 0;
  return def.endpoints[other].typeId;
}

export function allowedTargetTypeIdsForEndpoint(
  registry: AssociationsFile,
  compositeType: string,
  endpointIndex: 0 | 1,
): string[] {
  const def = registry.associations[normalizeAssociationId(compositeType)];
  if (!def?.endpoints) return [];
  const other: 0 | 1 = endpointIndex === 0 ? 1 : 0;
  return [def.endpoints[other].typeId];
}

export interface AssociationRuleEntry {
  id: string;
  sourceTypeId: string;
  type: string;
  allowedTargetTypeIds: string[];
}

/** All relationship rules implied by registry endpoint definitions. */
export function associationRulesFromRegistry(
  registry: AssociationsFile,
): AssociationRuleEntry[] {
  const rules: AssociationRuleEntry[] = [];
  for (const [composite, def] of Object.entries(registry.associations)) {
    if (!def.endpoints) continue;
    for (const hostIndex of [0, 1] as const) {
      const sourceTypeId = def.endpoints[hostIndex].typeId;
      const type = projectionTypeForEndpoint(composite, hostIndex);
      rules.push({
        id: composite,
        sourceTypeId,
        type,
        allowedTargetTypeIds: allowedTargetTypeIdsForEndpoint(registry, composite, hostIndex),
      });
    }
  }
  return rules;
}

/** Whether a relation section should show the inline link-existing control. */
export function relationSectionSupportsLinkExisting(
  registry: AssociationsFile,
  typeOrProjection: string,
  compositeType?: string,
): boolean {
  const parsed = parseProjectionType(typeOrProjection);
  let composite: string;
  let endpointIndex: 0 | 1;
  try {
    if (compositeType) {
      composite = requireAssociationId(registry, compositeType);
      endpointIndex = parsed?.endpointIndex ?? 0;
    } else if (parsed) {
      composite = requireAssociationId(registry, parsed.associationId);
      endpointIndex = parsed.endpointIndex;
    } else {
      composite = requireAssociationId(registry, typeOrProjection);
      endpointIndex = 0;
    }
  } catch {
    return false;
  }
  const def = registry.associations[composite];
  if (!def) return false;
  const linkExisting = linkExistingForEndpoint(def, endpointIndex);
  return linkExisting !== undefined ? linkExisting : true;
}

/** @internal re-export for callers that still import PerspectiveLabelConfig here */
export type { PerspectiveLabelConfig };
