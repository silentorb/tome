import { normalizeRelationshipType } from "./relation-type";
import type { RelationshipEntry } from "./content/relationships-file";
import {
  normalizeRelationshipTypeId,
  parseProjectionType,
  projectionTypeForEndpoint,
  type RelationshipTypeDefinition,
  type RelationshipTypesFile,
  type TraitEntry,
} from "./content/relationship-types-file";
import { resolveContentPath } from "./content/paths";
import { loadRelationshipTypesFromContent } from "./relationship-types/load";
import { loadViewsFromContent } from "./views/load";

export const SET_TRAIT = "set";
export const ORDERED_TRAIT = "ordered";
export const SYMMETRIC_TRAIT = "symmetric";
export const ORDERED_PROPERTY_DEFAULT = "order";

const DEFAULT_PARENT_INDEX = 0;
const DEFAULT_CHILD_INDEX = 1;

export type TraitMapValue = true | Record<string, unknown>;

export function traitEntryKey(entry: TraitEntry): string {
  return typeof entry === "string" ? entry : entry.key;
}

/** Normalize traits array to a lookup map (internal; not persisted). */
export function traitMap(def: RelationshipTypeDefinition | undefined): Map<string, TraitMapValue> {
  const map = new Map<string, TraitMapValue>();
  if (!def?.traits) return map;
  for (const entry of def.traits) {
    if (typeof entry === "string") {
      map.set(entry, true);
      continue;
    }
    const { key, ...config } = entry;
    map.set(key, Object.keys(config).length > 0 ? config : true);
  }
  return map;
}

export function hasTrait(def: RelationshipTypeDefinition | undefined, key: string): boolean {
  const normalized = normalizeRelationshipType(key);
  return traitMap(def).has(normalized);
}

export function traitConfig(
  def: RelationshipTypeDefinition | undefined,
  key: string,
): Record<string, unknown> | undefined {
  const value = traitMap(def).get(normalizeRelationshipType(key));
  if (value === undefined || value === true) return undefined;
  return value;
}

export function typesWithTrait(registry: RelationshipTypesFile, key: string): string[] {
  const normalized = normalizeRelationshipType(key);
  return Object.entries(registry.relationshipTypes)
    .filter(([, def]) => traitMap(def).has(normalized))
    .map(([composite]) => composite);
}

export function isSetTraitType(def: RelationshipTypeDefinition | undefined): boolean {
  return hasTrait(def, SET_TRAIT);
}

export function isOrderedTraitType(def: RelationshipTypeDefinition | undefined): boolean {
  return hasTrait(def, ORDERED_TRAIT);
}

export function isSymmetricRelationshipType(def: RelationshipTypeDefinition | undefined): boolean {
  return hasTrait(def, SYMMETRIC_TRAIT);
}

export function isSymmetricComposite(
  registry: RelationshipTypesFile,
  compositeType: string,
): boolean {
  return isSymmetricRelationshipType(registry.relationshipTypes[normalizeRelationshipTypeId(compositeType)]);
}

export function isSetTraitComposite(
  registry: RelationshipTypesFile,
  compositeType: string,
): boolean {
  return isSetTraitType(registry.relationshipTypes[normalizeRelationshipTypeId(compositeType)]);
}

export function isOrderedTraitComposite(
  registry: RelationshipTypesFile,
  compositeType: string,
): boolean {
  return isOrderedTraitType(registry.relationshipTypes[normalizeRelationshipTypeId(compositeType)]);
}

export function orderedPropertyName(def: RelationshipTypeDefinition | undefined): string {
  const config = traitConfig(def, ORDERED_TRAIT);
  const property = config?.property;
  if (typeof property === "string" && property.trim()) {
    return normalizeRelationshipType(property);
  }
  return ORDERED_PROPERTY_DEFAULT;
}

export interface SetRoleIndices {
  parentIndex: 0 | 1;
  childIndex: 0 | 1;
}

function parseIndex(value: unknown, fallback: 0 | 1): 0 | 1 {
  if (value === 0 || value === 1) return value;
  return fallback;
}

export function setRoleIndices(def: RelationshipTypeDefinition | undefined): SetRoleIndices {
  const config = traitConfig(def, SET_TRAIT);
  const parentIndex = parseIndex(config?.parentIndex, DEFAULT_PARENT_INDEX);
  const childIndex = parseIndex(config?.childIndex, DEFAULT_CHILD_INDEX);
  if (parentIndex === childIndex) {
    return { parentIndex: DEFAULT_PARENT_INDEX, childIndex: DEFAULT_CHILD_INDEX };
  }
  return { parentIndex, childIndex };
}

export function nodeIdAtIndex(entry: RelationshipEntry, index: 0 | 1): string {
  return index === 0 ? entry.a : entry.b;
}

export function parentNodeId(
  def: RelationshipTypeDefinition | undefined,
  entry: RelationshipEntry,
): string {
  const { parentIndex } = setRoleIndices(def);
  return nodeIdAtIndex(entry, parentIndex);
}

export function childNodeId(
  def: RelationshipTypeDefinition | undefined,
  entry: RelationshipEntry,
): string {
  const { childIndex } = setRoleIndices(def);
  return nodeIdAtIndex(entry, childIndex);
}

export function isSetTraitEntry(
  registry: RelationshipTypesFile,
  entry: RelationshipEntry,
): boolean {
  return isSetTraitComposite(registry, entry.type);
}

/** All set-trait relationship type ids. */
export function setTraitRelationshipTypeIds(registry: RelationshipTypesFile): string[] {
  return typesWithTrait(registry, SET_TRAIT);
}

export function setSideProjectionType(
  registry: RelationshipTypesFile,
  relationshipTypeId: string,
): string {
  const def = registry.relationshipTypes[normalizeRelationshipTypeId(relationshipTypeId)];
  if (!def || !isSetTraitType(def)) {
    throw new Error(`Unknown set-trait composite "${relationshipTypeId}"`);
  }
  const { parentIndex } = setRoleIndices(def);
  return projectionTypeForEndpoint(relationshipTypeId, parentIndex);
}

export function memberSideProjectionType(
  registry: RelationshipTypesFile,
  relationshipTypeId: string,
): string {
  const def = registry.relationshipTypes[normalizeRelationshipTypeId(relationshipTypeId)];
  if (!def || !isSetTraitType(def)) {
    throw new Error(`Unknown set-trait composite "${relationshipTypeId}"`);
  }
  const { childIndex } = setRoleIndices(def);
  return projectionTypeForEndpoint(relationshipTypeId, childIndex);
}

/** Directed projection types for every set-trait relationship type (both endpoints). */
export function setTraitProjectionTypes(registry: RelationshipTypesFile): string[] {
  const types: string[] = [];
  for (const relationshipTypeId of setTraitRelationshipTypeIds(registry)) {
    types.push(setSideProjectionType(registry, relationshipTypeId));
    types.push(memberSideProjectionType(registry, relationshipTypeId));
  }
  return types;
}

export function setSideProjectionTypes(registry: RelationshipTypesFile): string[] {
  return setTraitRelationshipTypeIds(registry).map((id) => setSideProjectionType(registry, id));
}

export function memberSideProjectionTypes(registry: RelationshipTypesFile): string[] {
  return setTraitRelationshipTypeIds(registry).map((id) =>
    memberSideProjectionType(registry, id),
  );
}

export function relationshipTypeIdFromTypeOrProjection(
  registry: RelationshipTypesFile,
  typeOrProjection: string,
): string | null {
  const parsed = parseProjectionType(typeOrProjection);
  if (parsed) return parsed.relationshipTypeId;
  const id = normalizeRelationshipTypeId(typeOrProjection);
  return registry.relationshipTypes[id] ? id : null;
}

export function isSetTraitProjectionType(
  registry: RelationshipTypesFile,
  type: string,
): boolean {
  const relationshipTypeId = relationshipTypeIdFromTypeOrProjection(registry, type);
  return relationshipTypeId !== null && isSetTraitComposite(registry, relationshipTypeId);
}

export function isSetSideProjectionType(
  registry: RelationshipTypesFile,
  type: string,
): boolean {
  return setSideProjectionTypes(registry).includes(type);
}

export function isMemberSideProjectionType(
  registry: RelationshipTypesFile,
  type: string,
): boolean {
  return memberSideProjectionTypes(registry).includes(type);
}

/** Parent/set and child/member directed projection types for a set-trait composite. */
export function setRoleProjectionTypesForComposite(
  registry: RelationshipTypesFile,
  composite: string,
): [string, string] {
  return [
    setSideProjectionType(registry, composite),
    memberSideProjectionType(registry, composite),
  ];
}

/**
 * When a node has no views declaring a set relationship type, use the sole
 * plain (non-ordered) set-trait composite, else the sole set-trait composite.
 */
function soleSetCompositeFallback(registry: RelationshipTypesFile): string {
  const setComposites = typesWithTrait(registry, SET_TRAIT);
  const plain = setComposites.filter((composite) => {
    const def = registry.relationshipTypes[composite];
    return def && !isOrderedTraitType(def);
  });
  if (plain.length === 1) return plain[0]!;
  if (setComposites.length === 1) return setComposites[0]!;
  throw new Error(
    "No set relationship type context: add a set-side relationship type in views.json for this node, or register a single set-trait relationship type",
  );
}

/** Resolve the set-trait relationship type id for a set node from views.json or sole fallback. */
export function setRoleRelationshipTypeForNode(
  nodeId: string,
  contentDir?: string,
): string {
  const dir = contentDir ?? resolveContentPath();
  const registry = loadRelationshipTypesFromContent(dir);
  const setIds = new Set(setTraitRelationshipTypeIds(registry));
  const fromViews = new Set<string>();
  for (const view of loadViewsFromContent(dir).views) {
    const relationshipTypeId = normalizeRelationshipTypeId(view.association);
    if (view.nodeId === nodeId && setIds.has(relationshipTypeId)) {
      fromViews.add(relationshipTypeId);
    }
  }
  if (fromViews.size > 0) {
    return [...fromViews][0]!;
  }
  return soleSetCompositeFallback(registry);
}

/** Parent/set and child/member projection types for a set node. */
export function setRoleProjectionTypesForNode(
  nodeId: string,
  contentDir?: string,
): [string, string] {
  const dir = contentDir ?? resolveContentPath();
  const registry = loadRelationshipTypesFromContent(dir);
  return setRoleProjectionTypesForComposite(registry, setRoleRelationshipTypeForNode(nodeId, dir));
}

export function isOrderedSetRelationshipType(
  registry: RelationshipTypesFile,
  relationshipTypeId: string,
): boolean {
  return (
    isSetTraitComposite(registry, relationshipTypeId) &&
    isOrderedTraitComposite(registry, relationshipTypeId)
  );
}

export function isOrderedSetProjectionType(
  registry: RelationshipTypesFile,
  type: string,
): boolean {
  const relationshipTypeId = relationshipTypeIdFromTypeOrProjection(registry, type);
  return relationshipTypeId !== null && isOrderedSetRelationshipType(registry, relationshipTypeId);
}
