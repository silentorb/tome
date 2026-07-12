import { normalizeRelationshipType } from "./relation-type";
import type { RelationshipEntry } from "./content/relationships-file";
import {
  normalizeAssociationId,
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

export function resolveSetTraitComposite(
  registry: AssociationsFile,
  perspective: string,
): string | null {
  const normalized = normalizeRelationshipType(perspective);
  for (const [composite, def] of Object.entries(registry.associations)) {
    if (isSetTraitType(def) && def.perspectives.includes(normalized)) {
      return composite;
    }
  }
  return null;
}

export function resolveOrderedSetTraitComposite(
  registry: AssociationsFile,
  perspective: string,
): string | null {
  const normalized = normalizeRelationshipType(perspective);
  for (const [composite, def] of Object.entries(registry.associations)) {
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
  registry: AssociationsFile,
  entry: RelationshipEntry,
): boolean {
  return isSetTraitComposite(registry, entry.type);
}

function uniquePerspectives(values: Iterable<string>): string[] {
  return [...new Set(values)];
}

export function setTraitPerspectives(registry: AssociationsFile): string[] {
  const perspectives: string[] = [];
  for (const composite of typesWithTrait(registry, SET_TRAIT)) {
    const def = registry.associations[composite];
    if (!def) continue;
    perspectives.push(def.perspectives[0], def.perspectives[1]);
  }
  return uniquePerspectives(perspectives);
}

export function setSidePerspectives(registry: AssociationsFile): string[] {
  const perspectives: string[] = [];
  for (const composite of typesWithTrait(registry, SET_TRAIT)) {
    const def = registry.associations[composite];
    if (!def) continue;
    const { parentIndex } = setRoleIndices(def);
    perspectives.push(def.perspectives[parentIndex]!);
  }
  return uniquePerspectives(perspectives);
}

export function memberSidePerspectives(registry: AssociationsFile): string[] {
  const perspectives: string[] = [];
  for (const composite of typesWithTrait(registry, SET_TRAIT)) {
    const def = registry.associations[composite];
    if (!def) continue;
    const { childIndex } = setRoleIndices(def);
    perspectives.push(def.perspectives[childIndex]!);
  }
  return uniquePerspectives(perspectives);
}

export function isSetTraitPerspective(
  registry: AssociationsFile,
  perspective: string,
): boolean {
  const normalized = normalizeRelationshipType(perspective);
  return setTraitPerspectives(registry).includes(normalized);
}

export function isSetSidePerspective(
  registry: AssociationsFile,
  perspective: string,
): boolean {
  const normalized = normalizeRelationshipType(perspective);
  return setSidePerspectives(registry).includes(normalized);
}

export function isMemberSidePerspective(
  registry: AssociationsFile,
  perspective: string,
): boolean {
  const normalized = normalizeRelationshipType(perspective);
  return memberSidePerspectives(registry).includes(normalized);
}

/** Parent/set and child/member perspectives for a set-trait composite. */
export function setRolePerspectivesForComposite(
  registry: AssociationsFile,
  composite: string,
): [string, string] {
  const normalized = normalizeAssociationId(composite);
  const def = registry.associations[normalized];
  if (!def || !isSetTraitType(def)) {
    throw new Error(`Unknown set-trait composite "${composite}"`);
  }
  const { parentIndex, childIndex } = setRoleIndices(def);
  return [def.perspectives[parentIndex]!, def.perspectives[childIndex]!];
}

/**
 * When a node has no views/edges declaring a set association, use the sole
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
    "No set association context: add a set-side perspective in views.json for this node, or register a single set-trait association",
  );
}

/**
 * Resolve set/member perspectives for a set node from project context:
 * views.json set-side perspectives for the node, else sole set-trait fallback.
 * Does not pick among multiple project associations via table-schemas.
 */
export function setRolePerspectivesForNode(
  nodeId: string,
  contentDir?: string,
): [string, string] {
  const dir = contentDir ?? resolveContentPath();
  const registry = loadAssociationsFromContent(dir);
  const setSide = new Set(setSidePerspectives(registry));
  const fromViews = new Set<string>();
  for (const view of loadViewsFromContent(dir).views) {
    const perspective = normalizeRelationshipType(view.perspective);
    if (view.nodeId === nodeId && setSide.has(perspective)) {
      fromViews.add(perspective);
    }
  }
  if (fromViews.size > 0) {
    const setPerspective = [...fromViews][0]!;
    const composite = resolveSetTraitComposite(registry, setPerspective);
    if (!composite) {
      throw new Error(`View perspective "${setPerspective}" is not a set-trait association`);
    }
    return setRolePerspectivesForComposite(registry, composite);
  }
  return setRolePerspectivesForComposite(registry, soleSetCompositeFallback(registry));
}

export function isOrderedSetPerspective(
  registry: AssociationsFile,
  perspective: string,
): boolean {
  const composite = resolveSetTraitComposite(registry, perspective);
  return composite !== null && isOrderedTraitComposite(registry, composite);
}
