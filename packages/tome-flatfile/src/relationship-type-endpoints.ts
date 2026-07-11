import { normalizeRelationshipType } from "./relation-type";
import type {
  PerspectiveLabelConfig,
  RelationshipTypeDefinition,
  RelationshipTypesFile,
} from "./content/relationship-types-file";
import { resolveCompositeType } from "./content/relationship-types-file";

function linkExistingFromPerspectiveLabel(
  config: PerspectiveLabelConfig | undefined,
): boolean | undefined {
  if (config === undefined) return undefined;
  if (typeof config === "string") return undefined;
  return config.linkExisting;
}

function linkExistingForPerspective(
  def: RelationshipTypeDefinition,
  perspective: string,
): boolean | undefined {
  const normalized = normalizeRelationshipType(perspective);
  const fromLabel = linkExistingFromPerspectiveLabel(def.perspectiveLabels?.[normalized]);
  if (fromLabel !== undefined) return fromLabel;
  return def.linkExisting;
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
  if (!def.endpoints) return null;
  if (def.endpoints[0].typeId === hostTypeId) return 0;
  if (def.endpoints[1].typeId === hostTypeId) return 1;
  return null;
}

/** Outgoing perspective slug when linking from a row in `hostTypeId`. */
export function perspectiveForHostTable(
  def: RelationshipTypeDefinition,
  hostTypeId: string,
): string | null {
  const index = hostEndpointIndex(def, hostTypeId);
  if (index === null) return null;
  return def.perspectives[index];
}

/** Target type-table id for a relation column on `hostTypeId`. */
export function targetTypeIdForHostTable(
  def: RelationshipTypeDefinition,
  hostTypeId: string,
): string | null {
  const index = hostEndpointIndex(def, hostTypeId);
  if (index === null || !def.endpoints) return null;
  const other: 0 | 1 = index === 0 ? 1 : 0;
  return def.endpoints[other].typeId;
}

export function allowedTargetTypeIdsForPerspective(
  registry: RelationshipTypesFile,
  compositeType: string,
  perspective: string,
): string[] {
  const def = registry.types[normalizeRelationshipType(compositeType)];
  if (!def?.endpoints) return [];
  const normalized = normalizeRelationshipType(perspective);
  if (def.perspectives[0] === normalized) return [def.endpoints[1].typeId];
  if (def.perspectives[1] === normalized) return [def.endpoints[0].typeId];
  return [];
}

export interface RelationshipTypeRuleEntry {
  id: string;
  sourceTypeId: string;
  type: string;
  allowedTargetTypeIds: string[];
}

/** All relationship rules implied by registry endpoint definitions. */
export function relationshipTypeRulesFromRegistry(
  registry: RelationshipTypesFile,
): RelationshipTypeRuleEntry[] {
  const rules: RelationshipTypeRuleEntry[] = [];
  for (const [composite, def] of Object.entries(registry.types)) {
    if (!def.endpoints) continue;
    for (const hostIndex of [0, 1] as const) {
      const sourceTypeId = def.endpoints[hostIndex].typeId;
      const perspective = def.perspectives[hostIndex];
      rules.push({
        id: composite,
        sourceTypeId,
        type: perspective,
        allowedTargetTypeIds: allowedTargetTypeIdsForPerspective(registry, composite, perspective),
      });
    }
  }
  return rules;
}

/** Whether a relation section should show the inline link-existing control. */
export function relationSectionSupportsLinkExisting(
  registry: RelationshipTypesFile,
  perspective: string,
  compositeType?: string,
): boolean {
  const normalized = normalizeRelationshipType(perspective);
  const composite = compositeType
    ? normalizeRelationshipType(compositeType)
    : resolveCompositeType(registry, normalized);
  const def = registry.types[composite];
  if (!def) return false;
  if (!def.perspectives.includes(normalized)) return false;
  const linkExisting = linkExistingForPerspective(def, normalized);
  return linkExisting !== undefined ? linkExisting : true;
}
