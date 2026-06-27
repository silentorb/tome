import type { GraphDatabase, Relationship } from "./graph";
import { MEMBER_OF_TYPE, MEMBERS_TYPE } from "./labels";
import { resolveContentPath } from "./content/paths";
import { archiveNodeId } from "./workspace/resolve";
import { hasTableSchemaEntry, loadTableSchemasFromContent } from "./table-schemas/load";

export const SET_MEMBERSHIP_TYPE = MEMBER_OF_TYPE;

export const MEMBERSHIP_PERSPECTIVES = [MEMBER_OF_TYPE, MEMBERS_TYPE] as const;

export type MembershipPerspective = (typeof MEMBERSHIP_PERSPECTIVES)[number];

export type SetKind = "type_table" | "archive";

export function isSetMembershipStorageType(type: string): boolean {
  return type === SET_MEMBERSHIP_TYPE;
}

export function isMembershipPerspective(perspective: string): perspective is MembershipPerspective {
  return (MEMBERSHIP_PERSPECTIVES as readonly string[]).includes(perspective);
}

/** Outgoing membership projections from nodeId for the given perspective. */
export function listSetMembership(
  db: GraphDatabase,
  nodeId: string,
  perspective: MembershipPerspective,
): Relationship[] {
  return db.listRelationshipsFromSource(nodeId, perspective);
}

export function memberSetIds(db: GraphDatabase, memberId: string): string[] {
  return listSetMembership(db, memberId, MEMBER_OF_TYPE).map((r) => r.targetNodeId);
}

export function setMemberIds(db: GraphDatabase, setId: string): string[] {
  const viaMembers = listSetMembership(db, setId, MEMBERS_TYPE).map((r) => r.targetNodeId);
  if (viaMembers.length > 0) return viaMembers;
  return db.listRelationshipsToTarget(setId, MEMBER_OF_TYPE).map((r) => r.sourceNodeId);
}

export function collectSetNodeIds(contentDir?: string): Set<string> {
  const dir = contentDir ?? resolveContentPath();
  const ids = new Set<string>();
  const schemas = loadTableSchemasFromContent(dir);
  for (const id of Object.keys(schemas.tables)) ids.add(id);
  try {
    ids.add(archiveNodeId(dir));
  } catch {
    /* workspace.json optional in tests */
  }
  return ids;
}

export function setKindForNode(
  db: GraphDatabase,
  nodeId: string,
  contentDir?: string,
): SetKind | null {
  const dir = contentDir ?? resolveContentPath();
  const archiveId = archiveNodeId(dir);
  if (archiveId && nodeId === archiveId) return "archive";
  if (hasTableSchemaEntry(dir, nodeId)) return "type_table";
  if (setMemberIds(db, nodeId).length > 0 || memberSetIds(db, nodeId).length > 0) {
    return "type_table";
  }
  return null;
}

export function isSetNode(db: GraphDatabase, nodeId: string, contentDir?: string): boolean {
  return setKindForNode(db, nodeId, contentDir) !== null;
}

export function findSetMembershipRelationship(
  db: GraphDatabase,
  memberId: string,
  setId: string,
): Relationship | null {
  return (
    listSetMembership(db, memberId, MEMBER_OF_TYPE).find((r) => r.targetNodeId === setId) ?? null
  );
}

/** Membership edges normalized for type-table row building (member as sourceNodeId). */
export function listSetMemberRowConnections(
  db: GraphDatabase,
  setId: string,
): Relationship[] {
  const viaMembers = listSetMembership(db, setId, MEMBERS_TYPE);
  if (viaMembers.length > 0) {
    return viaMembers.map((r) => ({
      ...r,
      sourceNodeId: r.targetNodeId,
      targetNodeId: setId,
    }));
  }
  return db.listRelationshipsToTarget(setId, MEMBER_OF_TYPE);
}

export function maxRowIndexForSet(db: GraphDatabase, setId: string): number {
  let max = -1;
  for (const connection of listSetMembership(db, setId, MEMBERS_TYPE)) {
    const raw = connection.properties.row_index;
    const index =
      typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
    if (Number.isFinite(index) && index > max) max = index;
  }
  if (max >= 0) return max;
  for (const connection of db.listRelationshipsToTarget(setId, MEMBER_OF_TYPE)) {
    const raw = connection.properties.row_index;
    const index =
      typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
    if (Number.isFinite(index) && index > max) max = index;
  }
  return max;
}
