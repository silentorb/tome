/** (member)-[:is_a {…}]->(set) — member belongs to a set (type table, archive, etc.). */
export const IS_A_TYPE = "is_a";

/** (set)-[:members]->(member) — inverse perspective for set membership. */
export const MEMBERS_TYPE = "members";

/** @deprecated Use IS_A_TYPE */
export const IS_A_LABEL = IS_A_TYPE;

/** Perspectives used when querying set membership (outgoing from each endpoint). */
export const TYPE_MEMBERSHIP_TYPES = [IS_A_TYPE, MEMBERS_TYPE] as const;

/** @deprecated Use MEMBERS_TYPE when querying from a set node. */
export const TYPE_MEMBERSHIP_FROM_SET_TYPES = [MEMBERS_TYPE] as const;

/** @deprecated Use TYPE_MEMBERSHIP_TYPES */
export const TYPE_MEMBERSHIP_LABELS = TYPE_MEMBERSHIP_TYPES;

export function isTypeMembershipType(type: string): boolean {
  return (TYPE_MEMBERSHIP_TYPES as readonly string[]).includes(type);
}

/** @deprecated Use isTypeMembershipType */
export const isTypeMembershipLabel = isTypeMembershipType;
