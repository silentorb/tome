import { normalizeRelationshipType } from "./relation-type";
import type { RelationshipEntry } from "./content/relationships-file";
import type {
  RelationshipTypeDefinition,
  RelationshipTypesFile,
} from "./content/relationship-types-file";

export const SET_TRAIT = "set";

const DEFAULT_PARENT_INDEX = 0;
const DEFAULT_CHILD_INDEX = 1;

export function hasTrait(def: RelationshipTypeDefinition | undefined, key: string): boolean {
  if (!def?.traits) return false;
  return normalizeRelationshipType(key) in def.traits;
}

export function traitConfig(
  def: RelationshipTypeDefinition | undefined,
  key: string,
): Record<string, unknown> | undefined {
  if (!def?.traits) return undefined;
  const value = def.traits[normalizeRelationshipType(key)];
  if (value === undefined) return undefined;
  if (value === true) return undefined;
  return value;
}

export function typesWithTrait(registry: RelationshipTypesFile, key: string): string[] {
  const normalized = normalizeRelationshipType(key);
  return Object.entries(registry.types)
    .filter(([, def]) => def.traits?.[normalized] !== undefined)
    .map(([composite]) => composite);
}

export function isSetTraitType(def: RelationshipTypeDefinition | undefined): boolean {
  return hasTrait(def, SET_TRAIT);
}

export function isSetTraitComposite(
  registry: RelationshipTypesFile,
  compositeType: string,
): boolean {
  return isSetTraitType(registry.types[normalizeRelationshipType(compositeType)]);
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

export function isSetTraitEntry(
  registry: RelationshipTypesFile,
  entry: RelationshipEntry,
): boolean {
  return isSetTraitComposite(registry, entry.type);
}
