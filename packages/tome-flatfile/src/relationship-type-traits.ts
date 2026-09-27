import {
  ORDERED_PROPERTY_DEFAULT,
  ORDERED_TRAIT,
  SET_TRAIT,
  SYMMETRIC_TRAIT,
  compileAssociationConfig,
  hasTrait as runtimeHasTrait,
  hasTraitInEntries,
  isOrderedTraitPredicate,
  isSetTraitPredicate,
  isSymmetricPredicate,
  orderedPropertyNameFor,
  setRoleIndicesFor,
  traitConfig as runtimeTraitConfig,
  traitConfigFromEntries,
  traitEntryKey,
  traitMapFromEntries,
  typesWithTrait as runtimeTypesWithTrait,
  type RelationshipRuntime,
  type SetRoleIndices,
  type TraitMapValue,
} from "tome-ontology";
import { normalizeRelationshipType } from "./relation-type";
import type { RelationshipEntry } from "./content/relationships-file";
import {
  normalizeRelationshipTypeId,
  parseProjectionType,
  projectionTypeForEndpoint,
  type RelationshipTypeDefinition,
  type RelationshipTypesFile,
} from "./content/relationship-types-file";
import { resolveContentPath } from "./content/paths";
import {
  loadRelationshipRuntimeFromContent,
  loadRelationshipTypesFromContent,
} from "./relationship-types/load";
import { loadViewsFromContent } from "./views/load";

export {
  SET_TRAIT,
  ORDERED_TRAIT,
  SYMMETRIC_TRAIT,
  ORDERED_PROPERTY_DEFAULT,
  traitEntryKey,
};
export type { TraitMapValue, SetRoleIndices };

function runtimeFromRegistry(registry: RelationshipTypesFile): RelationshipRuntime {
  return compileAssociationConfig(registry);
}

/** Normalize traits array to a lookup map (internal; not persisted). */
export function traitMap(def: RelationshipTypeDefinition | undefined): Map<string, TraitMapValue> {
  return traitMapFromEntries(def?.traits);
}

export function hasTrait(def: RelationshipTypeDefinition | undefined, key: string): boolean {
  return hasTraitInEntries(def?.traits, key);
}

export function traitConfig(
  def: RelationshipTypeDefinition | undefined,
  key: string,
): Record<string, unknown> | undefined {
  return traitConfigFromEntries(def?.traits, key);
}

export function typesWithTrait(registry: RelationshipTypesFile, key: string): string[] {
  return runtimeTypesWithTrait(runtimeFromRegistry(registry), key);
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
  return isSymmetricPredicate(runtimeFromRegistry(registry), normalizeRelationshipTypeId(compositeType));
}

export function isSetTraitComposite(
  registry: RelationshipTypesFile,
  compositeType: string,
): boolean {
  return isSetTraitPredicate(runtimeFromRegistry(registry), normalizeRelationshipTypeId(compositeType));
}

export function isOrderedTraitComposite(
  registry: RelationshipTypesFile,
  compositeType: string,
): boolean {
  return isOrderedTraitPredicate(
    runtimeFromRegistry(registry),
    normalizeRelationshipTypeId(compositeType),
  );
}

export function orderedPropertyName(def: RelationshipTypeDefinition | undefined): string {
  const config = traitConfig(def, ORDERED_TRAIT);
  const property = config?.property;
  if (typeof property === "string" && property.trim()) {
    return normalizeRelationshipType(property);
  }
  return ORDERED_PROPERTY_DEFAULT;
}

export function setRoleIndices(def: RelationshipTypeDefinition | undefined): SetRoleIndices {
  // Compile a one-off runtime so set-role indices come from pattern traits.
  const runtime = compileAssociationConfig({
    version: 1,
    relationshipTypes: { _: def ?? { perspectives: ["", ""] } },
  });
  return setRoleIndicesFor(runtime, "_");
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
  const id = normalizeRelationshipTypeId(relationshipTypeId);
  const runtime = runtimeFromRegistry(registry);
  if (!isSetTraitPredicate(runtime, id)) {
    throw new Error(`Unknown set-trait composite "${relationshipTypeId}"`);
  }
  const { parentIndex } = setRoleIndicesFor(runtime, id);
  return projectionTypeForEndpoint(relationshipTypeId, parentIndex);
}

export function memberSideProjectionType(
  registry: RelationshipTypesFile,
  relationshipTypeId: string,
): string {
  const id = normalizeRelationshipTypeId(relationshipTypeId);
  const runtime = runtimeFromRegistry(registry);
  if (!isSetTraitPredicate(runtime, id)) {
    throw new Error(`Unknown set-trait composite "${relationshipTypeId}"`);
  }
  const { childIndex } = setRoleIndicesFor(runtime, id);
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
function soleSetCompositeFallback(runtime: RelationshipRuntime): string {
  const setComposites = runtimeTypesWithTrait(runtime, SET_TRAIT);
  const plain = setComposites.filter(
    (composite) => !runtimeHasTrait(runtime, { predicateId: composite }, ORDERED_TRAIT),
  );
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
  const runtime = loadRelationshipRuntimeFromContent(dir);
  const setIds = new Set(runtimeTypesWithTrait(runtime, SET_TRAIT));
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
  return soleSetCompositeFallback(runtime);
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

/** @internal helpers used when a runtime is already in hand */
export {
  runtimeHasTrait,
  runtimeTraitConfig,
  runtimeTypesWithTrait,
  orderedPropertyNameFor,
  setRoleIndicesFor,
  isSetTraitPredicate,
  isOrderedTraitPredicate,
  isSymmetricPredicate,
};
