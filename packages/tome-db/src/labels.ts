/** (member)-[:member_of {…}]->(set) — member belongs to a set (type table, archive, etc.). */
export const MEMBER_OF_TYPE = "member_of";

/** (set)-[:members]->(member) — inverse perspective for set membership. */
export const MEMBERS_TYPE = "members";

/** @deprecated Use MEMBER_OF_TYPE */
export const IS_A_TYPE = MEMBER_OF_TYPE;

/** @deprecated Use MEMBER_OF_TYPE */
export const IS_A_LABEL = MEMBER_OF_TYPE;

/** Perspectives used when querying set membership (outgoing from each endpoint). */
export const TYPE_MEMBERSHIP_TYPES = [MEMBER_OF_TYPE, MEMBERS_TYPE] as const;

/** @deprecated Use MEMBERS_TYPE when querying from a set node. */
export const TYPE_MEMBERSHIP_FROM_SET_TYPES = [MEMBERS_TYPE] as const;

/** @deprecated Use TYPE_MEMBERSHIP_TYPES */
export const TYPE_MEMBERSHIP_LABELS = TYPE_MEMBERSHIP_TYPES;

export function isTypeMembershipType(type: string): boolean {
  return (TYPE_MEMBERSHIP_TYPES as readonly string[]).includes(type);
}

/** @deprecated Use isTypeMembershipType */
export const isTypeMembershipLabel = isTypeMembershipType;
