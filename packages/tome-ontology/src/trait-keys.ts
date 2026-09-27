/** Built-in trait keys (hardcoded ontology vocabulary). */
export const SET_TRAIT = "set";
export const ORDERED_TRAIT = "ordered";
export const SYMMETRIC_TRAIT = "symmetric";
export const ORDERED_PROPERTY_DEFAULT = "order";

/** Normalize a trait key for lookup (trim, lower, hyphen→underscore). */
export function normalizeTraitKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/-/g, "_");
}
