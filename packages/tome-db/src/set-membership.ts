import type { GraphDatabase, Relationship } from "tome-sqlite";
import {
  resolveContentPath,
  loadAssociationsFromContent,
  archiveNodeId,
  hasTableSchemaEntry,
  setRoleIndices,
  typesWithTrait,
  SET_TRAIT,
  collectSetNodeIds,
  setRolePerspectivesForNode,
} from "tome-flatfile";

export { collectSetNodeIds } from "tome-flatfile";

export type SetKind = "type_table" | "archive";

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
  const registry = loadAssociationsFromContent(dir);
  const ids = new Set<string>();
  for (const composite of typesWithTrait(registry, SET_TRAIT)) {
    const def = registry.associations[composite];
    if (!def) continue;
    const { parentIndex, childIndex } = setRoleIndices(def);
    const setPerspective = def.perspectives[parentIndex]!;
    const memberPerspective = def.perspectives[childIndex]!;
    for (const rel of db.listRelationshipsFromSource(setId, setPerspective)) {
      ids.add(rel.targetNodeId);
    }
    for (const rel of db.listRelationshipsToTarget(setId, memberPerspective)) {
      ids.add(rel.sourceNodeId);
    }
  }
  return [...ids];
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

export function findSetEdge(
  db: GraphDatabase,
  memberId: string,
  setId: string,
  contentDir?: string,
): Relationship | null {
  const dir = contentDir ?? resolveContentPath();
  const registry = loadAssociationsFromContent(dir);
  for (const composite of typesWithTrait(registry, SET_TRAIT)) {
    const def = registry.associations[composite];
    if (!def) continue;
    const { childIndex } = setRoleIndices(def);
    const memberPerspective = def.perspectives[childIndex]!;
    const edge = db
      .listRelationshipsFromSource(memberId, memberPerspective)
      .find((r) => r.targetNodeId === setId);
    if (edge) return edge;
  }
  return null;
}

/** Set edges normalized for type-table row building (member as sourceNodeId). */
export function listSetMemberRowConnections(
  db: GraphDatabase,
  setId: string,
  contentDir?: string,
): Relationship[] {
  const dir = contentDir ?? resolveContentPath();
  const registry = loadAssociationsFromContent(dir);
  const byMember = new Map<string, Relationship>();
  for (const composite of typesWithTrait(registry, SET_TRAIT)) {
    const def = registry.associations[composite];
    if (!def) continue;
    const { parentIndex, childIndex } = setRoleIndices(def);
    const setPerspective = def.perspectives[parentIndex]!;
    const memberPerspective = def.perspectives[childIndex]!;
    for (const r of db.listRelationshipsFromSource(setId, setPerspective)) {
      byMember.set(r.targetNodeId, {
        ...r,
        sourceNodeId: r.targetNodeId,
        targetNodeId: setId,
      });
    }
    for (const r of db.listRelationshipsToTarget(setId, memberPerspective)) {
      if (!byMember.has(r.sourceNodeId)) byMember.set(r.sourceNodeId, r);
    }
  }
  return [...byMember.values()];
}

/** Set/member perspectives for a set node from views (or sole set-trait fallback). */
export function setRolePerspectives(setId: string, contentDir?: string): [string, string] {
  return setRolePerspectivesForNode(setId, contentDir);
}
