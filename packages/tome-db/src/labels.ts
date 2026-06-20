/** (instance)-[:is_a {…}]->(type) — a page is an instance of a type (imported from Notion database rows). */
export const IS_A_TYPE = "is_a";

/** @deprecated Use IS_A_TYPE */
export const IS_A_LABEL = IS_A_TYPE;

export const TYPE_MEMBERSHIP_TYPES = [IS_A_TYPE] as const;

/** @deprecated Use TYPE_MEMBERSHIP_TYPES */
export const TYPE_MEMBERSHIP_LABELS = TYPE_MEMBERSHIP_TYPES;

export function isTypeMembershipType(type: string): boolean {
  return (TYPE_MEMBERSHIP_TYPES as readonly string[]).includes(type);
}

/** @deprecated Use isTypeMembershipType */
export const isTypeMembershipLabel = isTypeMembershipType;
