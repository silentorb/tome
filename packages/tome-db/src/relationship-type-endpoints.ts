import type { GraphDatabase } from "./graph";
import { typeIdsForInstance } from "./node-capabilities";
import { normalizeRelationshipType } from "./relation-type";
import type {
  RelationshipTypeDefinition,
  RelationshipTypeEndpoints,
  RelationshipTypesFile,
} from "./content/relationship-types-file";
import { resolveCompositeType } from "./content/relationship-types-file";

/** Structural parent/child perspectives routed to `parents_children`. */
export const PARENTS_CHILDREN_PERSPECTIVES: ReadonlySet<string> = new Set([
  "parents",
  "children",
]);

export const PARENTS_CHILDREN_COMPOSITE = "parents_children";

/** Taxonomy↔inspiration perspective on the taxonomy side. */
export const TAXONOMY_INSPIRATION_PERSPECTIVES: ReadonlySet<string> = new Set([
  "monsters",
  "pacing",
  "story_scale",
  "traversal_types",
  "traversal_reasons",
  "prop_type",
]);

/** Perspectives that use structural one-to-many UI (no link-existing). */
const STRUCTURAL_LINK_PERSPECTIVES: ReadonlySet<string> = new Set([
  ...PARENTS_CHILDREN_PERSPECTIVES,
  "part",
]);

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

export interface RelationshipTypeRuleContext {
  compositeType: string;
  type: string;
  allowedTargetTypeIds: string[];
}

export function relationshipTypeRuleContext(
  registry: RelationshipTypesFile,
  db: GraphDatabase,
  sourceNodeId: string,
  perspective: string,
  contentDir?: string,
): RelationshipTypeRuleContext | null {
  const normalized = normalizeRelationshipType(perspective);
  const composite = resolveCompositeType(registry, normalized);
  const def = registry.types[composite];
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
  def: RelationshipTypeDefinition,
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
  registry: RelationshipTypesFile,
  db: GraphDatabase,
  nodeA: string,
  nodeB: string,
  contentDir?: string,
): string | null {
  for (const [composite, def] of Object.entries(registry.types)) {
    if (!def.endpoints) continue;
    if (endpointsMatchInstances(def, db, nodeA, nodeB, contentDir)) return composite;
  }
  return null;
}

export function relationSectionSupportsLinkExisting(
  registry: RelationshipTypesFile,
  perspective: string,
): boolean {
  const normalized = normalizeRelationshipType(perspective);
  if (STRUCTURAL_LINK_PERSPECTIVES.has(normalized)) return false;
  const composite = resolveCompositeType(registry, normalized);
  const def = registry.types[composite];
  if (!def) return false;
  if (composite === PARENTS_CHILDREN_COMPOSITE) return false;
  if (!def.perspectives.includes(normalized)) return false;
  if (TAXONOMY_INSPIRATION_PERSPECTIVES.has(normalized)) return true;
  return true;
}

export function isStructuralHierarchyPerspective(perspective: string): boolean {
  return PARENTS_CHILDREN_PERSPECTIVES.has(normalizeRelationshipType(perspective));
}
