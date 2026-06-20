import { normalizeRelationshipType } from "./relation-type";

/** Storage type for symmetric cross-entity associations. */
export const INCLUDES_TYPE = "includes";

/** Composite / unidirectional types rewritten to `includes` by migration. */
export const MIGRATE_TO_INCLUDES_STORAGE_TYPES: ReadonlySet<string> = new Set([
  "inspirations_features",
  "inspirations",
  "scenes_characters",
  "scenes_location",
  "products_features",
  "products_characters",
  "products",
  "solutions_features",
  "solutions_products",
  "solutions_scenes",
  "solutions",
  "features_bible_passages",
  "features",
  "groups_characters",
  "characters_character_attributes",
]);

/** Legacy Notion column slugs that resolve to `includes` storage (not taxonomy↔inspiration). */
export const INCLUDES_PERSPECTIVE_SLUGS: ReadonlySet<string> = new Set([
  "includes",
  "inspirations",
  "features",
  "characters",
  "location",
  "products",
  "solutions",
  "bible_passages",
  "groups",
  "character_attributes",
]);

/** Taxonomy↔inspiration composites kept as-is (deferred). */
export const TAXONOMY_INSPIRATION_PERSPECTIVES: ReadonlySet<string> = new Set([
  "monsters",
  "pacing",
  "story_scale",
  "traversal_types",
  "traversal_reasons",
  "prop_type",
]);

export function isIncludesStorageType(type: string): boolean {
  return normalizeRelationshipType(type) === INCLUDES_TYPE;
}

export function isMigratableToIncludesStorageType(type: string): boolean {
  return MIGRATE_TO_INCLUDES_STORAGE_TYPES.has(normalizeRelationshipType(type));
}

export function isIncludesPerspectiveSlug(localType: string): boolean {
  const normalized = normalizeRelationshipType(localType);
  if (TAXONOMY_INSPIRATION_PERSPECTIVES.has(normalized)) return false;
  return INCLUDES_PERSPECTIVE_SLUGS.has(normalized);
}

export function resolveStorageTypeForPerspective(
  registryTypes: Record<string, { bidirectional: boolean; perspectives: string[] }>,
  localType: string,
): string {
  const normalized = normalizeRelationshipType(localType);
  if (isIncludesPerspectiveSlug(normalized)) return INCLUDES_TYPE;
  for (const [composite, def] of Object.entries(registryTypes)) {
    if (def.perspectives.includes(normalized)) return composite;
  }
  return normalized;
}

/** Whether a relation table section supports linking existing records (many-to-many associative). */
export function relationSectionSupportsLinkExisting(perspective: string): boolean {
  const normalized = normalizeRelationshipType(perspective);
  if (normalized === INCLUDES_TYPE || perspective.startsWith(`${INCLUDES_TYPE}:`)) {
    return true;
  }
  if (isIncludesPerspectiveSlug(perspective)) return true;
  if (TAXONOMY_INSPIRATION_PERSPECTIVES.has(normalized)) return true;
  return false;
}
