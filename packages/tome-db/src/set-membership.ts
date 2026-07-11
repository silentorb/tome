import type { GraphDatabase, Relationship } from "tome-sqlite";
import {
  resolveContentPath,
  loadAssociationsFromContent,
  archiveNodeId,
  hasTableSchemaEntry,
  isSetTraitComposite,
  membershipPerspectivesForSet,
  setRoleIndices,
  setTraitPerspectives,
  typesWithTrait,
  SET_TRAIT,
  collectSetNodeIds,
} from "tome-flatfile";

export { collectSetNodeIds } from "tome-flatfile";

export type SetKind = "type_table" | "archive";

export function membershipPerspectives(contentDir?: string): string[] {
  const dir = contentDir ?? resolveContentPath();
  const registry = loadAssociationsFromContent(dir);
  return setTraitPerspectives(registry);
}

export function isSetMembershipStorageType(type: string, contentDir?: string): boolean {
  const dir = contentDir ?? resolveContentPath();
  const registry = loadAssociationsFromContent(dir);
  return isSetTraitComposite(registry, type);
}

export function isMembershipPerspective(perspective: string, contentDir?: string): boolean {
  const dir = contentDir ?? resolveContentPath();
  const registry = loadAssociationsFromContent(dir);
  return setTraitPerspectives(registry).includes(perspective);
}

/** Outgoing membership projections from nodeId for the given perspective. */
export function listSetMembership(
  db: GraphDatabase,
  nodeId: string,
  perspective: string,
): Relationship[] {
  return db.listRelationshipsFromSource(nodeId, perspective);
}

export function memberSetIds(db: GraphDatabase, memberId: string, contentDir?: string): string[] {
  const dir = contentDir ?? resolveContentPath();
  const registry = loadAssociationsFromContent(dir);
  const ids = new Set<string>();
  for (const composite of typesWithTrait(registry, SET_TRAIT)) {
    const def = registry.associations[composite];
    if (!def) continue;
    const { childIndex } = setRoleIndices(def);
    const memberPerspective = def.perspectives[childIndex]!;
    for (const rel of db.listRelationshipsFromSource(memberId, memberPerspective)) {
      ids.add(rel.targetNodeId);
    }
  }
  return [...ids];
}

export function setMemberIds(db: GraphDatabase, setId: string, contentDir?: string): string[] {
  const dir = contentDir ?? resolveContentPath();
  const [setPerspective, memberPerspective] = membershipPerspectivesForSet(setId, dir);
  const viaSet = listSetMembership(db, setId, setPerspective).map((r) => r.targetNodeId);
  if (viaSet.length > 0) return viaSet;
  return db.listRelationshipsToTarget(setId, memberPerspective).map((r) => r.sourceNodeId);
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
  if (setMemberIds(db, nodeId, dir).length > 0 || memberSetIds(db, nodeId, dir).length > 0) {
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
  contentDir?: string,
): Relationship | null {
  const dir = contentDir ?? resolveContentPath();
  const [, memberPerspective] = membershipPerspectivesForSet(setId, dir);
  return (
    listSetMembership(db, memberId, memberPerspective).find((r) => r.targetNodeId === setId) ??
    null
  );
}

/** Membership edges normalized for type-table row building (member as sourceNodeId). */
export function listSetMemberRowConnections(
  db: GraphDatabase,
  setId: string,
  contentDir?: string,
): Relationship[] {
  const dir = contentDir ?? resolveContentPath();
  const [setPerspective, memberPerspective] = membershipPerspectivesForSet(setId, dir);
  const viaMembers = listSetMembership(db, setId, setPerspective);
  if (viaMembers.length > 0) {
    return viaMembers.map((r) => ({
      ...r,
      sourceNodeId: r.targetNodeId,
      targetNodeId: setId,
    }));
  }
  return db.listRelationshipsToTarget(setId, memberPerspective);
}
