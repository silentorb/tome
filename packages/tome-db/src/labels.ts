/** (member)-[:member_of {…}]->(set) — member belongs to a set (type table, archive, etc.). */
export const MEMBER_OF_TYPE = "member_of";

/** (set)-[:members]->(member) — inverse perspective for set membership. */
export const MEMBERS_TYPE = "members";

/** (member)-[:ordered_member_of {order, …}]->(set) — ordered set membership. */
export const ORDERED_MEMBER_OF_TYPE = "ordered_member_of";

/** (set)-[:ordered_members]->(member) — inverse perspective for ordered set membership. */
export const ORDERED_MEMBERS_TYPE = "ordered_members";
