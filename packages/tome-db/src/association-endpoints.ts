import type { GraphDatabase } from "tome-sqlite";
import { typeIdsForInstance } from "./node-capabilities";
import {
  AmbiguousAssociationError,
  UnknownPerspectiveError,
  normalizeAssociationId,
  normalizeRelationshipType,
  resolveAssociationId,
} from "tome-flatfile";
import type {
  PerspectiveLabelConfig,
  AssociationDefinition,
  AssociationsFile,
} from "tome-flatfile";

function linkExistingFromPerspectiveLabel(
  config: PerspectiveLabelConfig | undefined,
): boolean | undefined {
  if (config === undefined) return undefined;
  if (typeof config === "string") return undefined;
  return config.linkExisting;
}

function linkExistingForPerspective(
  def: AssociationDefinition,
  perspective: string,
): boolean | undefined {
  const normalized = normalizeRelationshipType(perspective);
  const fromLabel = linkExistingFromPerspectiveLabel(def.perspectiveLabels?.[normalized]);
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

/** Outgoing perspective slug when linking from a row in `hostTypeId`. */
export function perspectiveForHostTable(
  def: AssociationDefinition,
  hostTypeId: string,
): string | null {
  const index = hostEndpointIndex(def, hostTypeId);
  if (index === null) return null;
  return def.perspectives[index];
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

export function allowedTargetTypeIdsForPerspective(
  registry: AssociationsFile,
  compositeType: string,
  perspective: string,
): string[] {
  const def = registry.associations[normalizeAssociationId(compositeType)];
  if (!def?.endpoints) return [];
  const normalized = normalizeRelationshipType(perspective);
  if (def.perspectives[0] === normalized) return [def.endpoints[1].typeId];
  if (def.perspectives[1] === normalized) return [def.endpoints[0].typeId];
  return [];
}

export interface AssociationRuleContext {
  compositeType: string;
  type: string;
  allowedTargetTypeIds: string[];
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

export function associationRuleContext(
  registry: AssociationsFile,
  db: GraphDatabase,
  sourceNodeId: string,
  perspective: string,
  contentDir?: string,
): AssociationRuleContext | null {
  const normalized = normalizeRelationshipType(perspective);
  let composite: string;
  try {
    composite = resolveAssociationId(registry, normalized);
  } catch (err) {
    if (
      err instanceof AmbiguousAssociationError ||
      err instanceof UnknownPerspectiveError
    ) {
      return null;
    }
    throw err;
  }
  const def = registry.associations[composite];
  if (!def?.endpoints) return null;

  const sourceTypes = typeIdsForInstance(db, sourceNodeId, contentDir);
  const hostIndex = def.perspectives[0] === normalized ? 0 : def.perspectives[1] === normalized ? 1 : null;
  if (hostIndex === null) return null;
  const sourceTypeId = def.endpoints[hostIndex].typeId;
  if (!sourceTypes.includes(sourceTypeId)) return null;

  const allowed = allowedTargetTypeIdsForPerspective(registry, composite, normalized);
  if (allowed.length === 0) return null;

  return {
    compositeType: composite,
    type: normalized,
    allowedTargetTypeIds: allowed,
  };
}

export function endpointsMatchInstances(
  def: AssociationDefinition,
  db: GraphDatabase,
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
  db: GraphDatabase,
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

/** Whether a relation section should show the inline link-existing control. */
export function relationSectionSupportsLinkExisting(
  registry: AssociationsFile,
  perspective: string,
  compositeType?: string,
): boolean {
  const normalized = normalizeRelationshipType(perspective);
  let composite: string;
  try {
    composite = compositeType
      ? normalizeAssociationId(compositeType)
      : resolveAssociationId(registry, normalized);
  } catch {
    return false;
  }
  const def = registry.associations[composite];
  if (!def) return false;
  if (!def.perspectives.includes(normalized)) return false;
  const linkExisting = linkExistingForPerspective(def, normalized);
  return linkExisting !== undefined ? linkExisting : true;
}
