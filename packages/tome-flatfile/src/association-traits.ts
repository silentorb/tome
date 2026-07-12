import { normalizeRelationshipType } from "./relation-type";
import type { RelationshipEntry } from "./content/relationships-file";
import {
  normalizeAssociationId,
  parseProjectionType,
  projectionTypeForEndpoint,
  type AssociationDefinition,
  type AssociationsFile,
  type TraitEntry,
} from "./content/associations-file";
import { resolveContentPath } from "./content/paths";
import { loadAssociationsFromContent } from "./associations/load";
import { loadViewsFromContent } from "./views/load";

export const SET_TRAIT = "set";
export const ORDERED_TRAIT = "ordered";
export const ORDERED_PROPERTY_DEFAULT = "order";

const DEFAULT_PARENT_INDEX = 0;
const DEFAULT_CHILD_INDEX = 1;

export type TraitMapValue = true | Record<string, unknown>;

export function traitEntryKey(entry: TraitEntry): string {
  return typeof entry === "string" ? entry : entry.key;
}

/** Normalize traits array to a lookup map (internal; not persisted). */
export function traitMap(def: AssociationDefinition | undefined): Map<string, TraitMapValue> {
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

export function hasTrait(def: AssociationDefinition | undefined, key: string): boolean {
  const normalized = normalizeRelationshipType(key);
  return traitMap(def).has(normalized);
}

export function traitConfig(
  def: AssociationDefinition | undefined,
  key: string,
): Record<string, unknown> | undefined {
  const value = traitMap(def).get(normalizeRelationshipType(key));
  if (value === undefined || value === true) return undefined;
  return value;
}

export function typesWithTrait(registry: AssociationsFile, key: string): string[] {
  const normalized = normalizeRelationshipType(key);
  return Object.entries(registry.associations)
    .filter(([, def]) => traitMap(def).has(normalized))
    .map(([composite]) => composite);
}

export function isSetTraitType(def: AssociationDefinition | undefined): boolean {
  return hasTrait(def, SET_TRAIT);
}

export function isOrderedTraitType(def: AssociationDefinition | undefined): boolean {
  return hasTrait(def, ORDERED_TRAIT);
}

export function isSetTraitComposite(
  registry: AssociationsFile,
  compositeType: string,
): boolean {
  return isSetTraitType(registry.associations[normalizeAssociationId(compositeType)]);
}

export function isOrderedTraitComposite(
  registry: AssociationsFile,
  compositeType: string,
): boolean {
  return isOrderedTraitType(registry.associations[normalizeAssociationId(compositeType)]);
}

export function orderedPropertyName(def: AssociationDefinition | undefined): string {
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

export function setRoleIndices(def: AssociationDefinition | undefined): SetRoleIndices {
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
  def: AssociationDefinition | undefined,
  entry: RelationshipEntry,
): string {
  const { parentIndex } = setRoleIndices(def);
  return nodeIdAtIndex(entry, parentIndex);
}

export function childNodeId(
  def: AssociationDefinition | undefined,
  entry: RelationshipEntry,
): string {
  const { childIndex } = setRoleIndices(def);
  return nodeIdAtIndex(entry, childIndex);
}

export function isSetTraitEntry(
  registry: AssociationsFile,
  entry: RelationshipEntry,
): boolean {
  return isSetTraitComposite(registry, entry.type);
}

/** All set-trait association ids. */
export function setTraitAssociationIds(registry: AssociationsFile): string[] {
  return typesWithTrait(registry, SET_TRAIT);
}

export function setSideProjectionType(
  registry: AssociationsFile,
  associationId: string,
): string {
  const def = registry.associations[normalizeAssociationId(associationId)];
  if (!def || !isSetTraitType(def)) {
    throw new Error(`Unknown set-trait composite "${associationId}"`);
  }
  const { parentIndex } = setRoleIndices(def);
  return projectionTypeForEndpoint(associationId, parentIndex);
}

export function memberSideProjectionType(
  registry: AssociationsFile,
  associationId: string,
): string {
  const def = registry.associations[normalizeAssociationId(associationId)];
  if (!def || !isSetTraitType(def)) {
    throw new Error(`Unknown set-trait composite "${associationId}"`);
  }
  const { childIndex } = setRoleIndices(def);
  return projectionTypeForEndpoint(associationId, childIndex);
}

/** Directed projection types for every set-trait association (both endpoints). */
export function setTraitProjectionTypes(registry: AssociationsFile): string[] {
  const types: string[] = [];
  for (const associationId of setTraitAssociationIds(registry)) {
    types.push(setSideProjectionType(registry, associationId));
    types.push(memberSideProjectionType(registry, associationId));
  }
  return types;
}

export function setSideProjectionTypes(registry: AssociationsFile): string[] {
  return setTraitAssociationIds(registry).map((id) => setSideProjectionType(registry, id));
}

export function memberSideProjectionTypes(registry: AssociationsFile): string[] {
  return setTraitAssociationIds(registry).map((id) =>
    memberSideProjectionType(registry, id),
  );
}

export function associationIdFromTypeOrProjection(
  registry: AssociationsFile,
  typeOrProjection: string,
): string | null {
  const parsed = parseProjectionType(typeOrProjection);
  if (parsed) return parsed.associationId;
  const id = normalizeAssociationId(typeOrProjection);
  return registry.associations[id] ? id : null;
}

export function isSetTraitProjectionType(
  registry: AssociationsFile,
  type: string,
): boolean {
  const associationId = associationIdFromTypeOrProjection(registry, type);
  return associationId !== null && isSetTraitComposite(registry, associationId);
}

export function isSetSideProjectionType(
  registry: AssociationsFile,
  type: string,
): boolean {
  return setSideProjectionTypes(registry).includes(type);
}

export function isMemberSideProjectionType(
  registry: AssociationsFile,
  type: string,
): boolean {
  return memberSideProjectionTypes(registry).includes(type);
}

/** Parent/set and child/member directed projection types for a set-trait composite. */
export function setRoleProjectionTypesForComposite(
  registry: AssociationsFile,
  composite: string,
): [string, string] {
  return [
    setSideProjectionType(registry, composite),
    memberSideProjectionType(registry, composite),
  ];
}

/**
 * When a node has no views declaring a set association, use the sole
 * plain (non-ordered) set-trait composite, else the sole set-trait composite.
 */
function soleSetCompositeFallback(registry: AssociationsFile): string {
  const setComposites = typesWithTrait(registry, SET_TRAIT);
  const plain = setComposites.filter((composite) => {
    const def = registry.associations[composite];
    return def && !isOrderedTraitType(def);
  });
  if (plain.length === 1) return plain[0]!;
  if (setComposites.length === 1) return setComposites[0]!;
  throw new Error(
    "No set association context: add a set-side association in views.json for this node, or register a single set-trait association",
  );
}

/** Resolve the set-trait association id for a set node from views.json or sole fallback. */
export function setRoleAssociationForNode(
  nodeId: string,
  contentDir?: string,
): string {
  const dir = contentDir ?? resolveContentPath();
  const registry = loadAssociationsFromContent(dir);
  const setIds = new Set(setTraitAssociationIds(registry));
  const fromViews = new Set<string>();
  for (const view of loadViewsFromContent(dir).views) {
    const associationId = normalizeAssociationId(view.association);
    if (view.nodeId === nodeId && setIds.has(associationId)) {
      fromViews.add(associationId);
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
  const registry = loadAssociationsFromContent(dir);
  return setRoleProjectionTypesForComposite(registry, setRoleAssociationForNode(nodeId, dir));
}

export function isOrderedSetAssociation(
  registry: AssociationsFile,
  associationId: string,
): boolean {
  return (
    isSetTraitComposite(registry, associationId) &&
    isOrderedTraitComposite(registry, associationId)
  );
}

export function isOrderedSetProjectionType(
  registry: AssociationsFile,
  type: string,
): boolean {
  const associationId = associationIdFromTypeOrProjection(registry, type);
  return associationId !== null && isOrderedSetAssociation(registry, associationId);
}
