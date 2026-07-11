import { normalizeRelationshipType } from "./relation-type";
import type { RelationshipEntry } from "./content/relationships-file";
import type {
  RelationshipTypeDefinition,
  RelationshipTypesFile,
  TraitEntry,
} from "./content/relationship-types-file";
import { resolveContentPath } from "./content/paths";
import { loadRelationshipTypesFromContent } from "./relationship-types/load";
import { getTableSchema } from "./table-schema";
import { loadTableSchemasFromContent } from "./table-schemas/load";

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
  return Object.entries(registry.types)
    .filter(([, def]) => traitMap(def).has(normalized))
    .map(([composite]) => composite);
}

export function isSetTraitType(def: RelationshipTypeDefinition | undefined): boolean {
  return hasTrait(def, SET_TRAIT);
}

export function isOrderedTraitType(def: RelationshipTypeDefinition | undefined): boolean {
  return hasTrait(def, ORDERED_TRAIT);
}

export function isSetTraitComposite(
  registry: RelationshipTypesFile,
  compositeType: string,
): boolean {
  return isSetTraitType(registry.types[normalizeRelationshipType(compositeType)]);
}

export function isOrderedTraitComposite(
  registry: RelationshipTypesFile,
  compositeType: string,
): boolean {
  return isOrderedTraitType(registry.types[normalizeRelationshipType(compositeType)]);
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

export function resolveSetTraitComposite(
  registry: RelationshipTypesFile,
  perspective: string,
): string | null {
  const normalized = normalizeRelationshipType(perspective);
  for (const [composite, def] of Object.entries(registry.types)) {
    if (isSetTraitType(def) && def.perspectives.includes(normalized)) {
      return composite;
    }
  }
  return null;
}

export function resolveOrderedSetTraitComposite(
  registry: RelationshipTypesFile,
  perspective: string,
): string | null {
  const normalized = normalizeRelationshipType(perspective);
  for (const [composite, def] of Object.entries(registry.types)) {
    if (
      isSetTraitType(def) &&
      isOrderedTraitType(def) &&
      def.perspectives.includes(normalized)
    ) {
      return composite;
    }
  }
  return null;
}

export function isSetTraitEntry(
  registry: RelationshipTypesFile,
  entry: RelationshipEntry,
): boolean {
  return isSetTraitComposite(registry, entry.type);
}

function uniquePerspectives(values: Iterable<string>): string[] {
  return [...new Set(values)];
}

export function setTraitPerspectives(registry: RelationshipTypesFile): string[] {
  const perspectives: string[] = [];
  for (const composite of typesWithTrait(registry, SET_TRAIT)) {
    const def = registry.types[composite];
    if (!def) continue;
    perspectives.push(def.perspectives[0], def.perspectives[1]);
  }
  return uniquePerspectives(perspectives);
}

export function setSidePerspectives(registry: RelationshipTypesFile): string[] {
  const perspectives: string[] = [];
  for (const composite of typesWithTrait(registry, SET_TRAIT)) {
    const def = registry.types[composite];
    if (!def) continue;
    const { parentIndex } = setRoleIndices(def);
    perspectives.push(def.perspectives[parentIndex]!);
  }
  return uniquePerspectives(perspectives);
}

export function memberSidePerspectives(registry: RelationshipTypesFile): string[] {
  const perspectives: string[] = [];
  for (const composite of typesWithTrait(registry, SET_TRAIT)) {
    const def = registry.types[composite];
    if (!def) continue;
    const { childIndex } = setRoleIndices(def);
    perspectives.push(def.perspectives[childIndex]!);
  }
  return uniquePerspectives(perspectives);
}

export function isSetTraitPerspective(
  registry: RelationshipTypesFile,
  perspective: string,
): boolean {
  const normalized = normalizeRelationshipType(perspective);
  return setTraitPerspectives(registry).includes(normalized);
}

export function isSetSidePerspective(
  registry: RelationshipTypesFile,
  perspective: string,
): boolean {
  const normalized = normalizeRelationshipType(perspective);
  return setSidePerspectives(registry).includes(normalized);
}

export function isMemberSidePerspective(
  registry: RelationshipTypesFile,
  perspective: string,
): boolean {
  const normalized = normalizeRelationshipType(perspective);
  return memberSidePerspectives(registry).includes(normalized);
}

export function membershipCompositeForPerspective(
  registry: RelationshipTypesFile,
  perspective: string,
): string | null {
  return resolveSetTraitComposite(registry, perspective);
}

export function defaultPlainSetMembershipComposite(registry: RelationshipTypesFile): string {
  for (const composite of typesWithTrait(registry, SET_TRAIT)) {
    const def = registry.types[composite];
    if (def && !isOrderedTraitType(def)) return composite;
  }
  throw new Error("No plain set-trait membership composite in relationship-types registry");
}

export function defaultOrderedSetMembershipComposite(registry: RelationshipTypesFile): string {
  for (const composite of typesWithTrait(registry, SET_TRAIT)) {
    const def = registry.types[composite];
    if (def && isOrderedTraitType(def)) return composite;
  }
  throw new Error("No ordered set-trait membership composite in relationship-types registry");
}

export function membershipCompositeForSet(setId: string, contentDir?: string): string {
  const dir = contentDir ?? resolveContentPath();
  const registry = loadRelationshipTypesFromContent(dir);
  const schema = getTableSchema(loadTableSchemasFromContent(dir), setId);
  const composite = schema?.membershipComposite;
  if (typeof composite === "string" && composite.trim()) {
    return normalizeRelationshipType(composite);
  }
  for (const candidate of typesWithTrait(registry, SET_TRAIT)) {
    const def = registry.types[candidate];
    if (def && !isOrderedTraitType(def)) return candidate;
  }
  for (const candidate of typesWithTrait(registry, SET_TRAIT)) {
    if (registry.types[candidate]) return candidate;
  }
  throw new Error(
    `No set-trait membership composite in relationship-types registry for set ${setId}`,
  );
}

export function membershipPerspectivesForSet(
  setId: string,
  contentDir?: string,
): [string, string] {
  const dir = contentDir ?? resolveContentPath();
  const registry = loadRelationshipTypesFromContent(dir);
  const composite = membershipCompositeForSet(setId, dir);
  const def = registry.types[composite];
  if (!def) {
    throw new Error(
      `Unknown membership composite "${composite}" for set ${setId}`,
    );
  }
  const { parentIndex, childIndex } = setRoleIndices(def);
  return [def.perspectives[parentIndex]!, def.perspectives[childIndex]!];
}

/** Set-side perspective used as views.json relationshipType / section key. */
export function viewSectionKeyForSet(setId: string, contentDir?: string): string {
  return membershipPerspectivesForSet(setId, contentDir)[0];
}

/** Member-side perspective for unlink/move against a set. */
export function memberSidePerspectiveForSet(setId: string, contentDir?: string): string {
  return membershipPerspectivesForSet(setId, contentDir)[1];
}

export function isOrderedMembershipSet(setId: string, contentDir?: string): boolean {
  const dir = contentDir ?? resolveContentPath();
  const registry = loadRelationshipTypesFromContent(dir);
  const composite = membershipCompositeForSet(setId, dir);
  return isOrderedTraitComposite(registry, composite);
}
