import type { Relationship } from "tome-graph-interfaces";
import {
  resolveContentPath,
  loadAssociationsFromContent,
  archiveNodeId,
  hasTableSchemaEntry,
  typesWithTrait,
  SET_TRAIT,
  collectSetNodeIds,
  setSideProjectionType,
  memberSideProjectionType,
} from "tome-flatfile";
import {
  listRelationshipsFromSource,
  listRelationshipsToTarget,
  type RelationshipReadStore,
} from "./graph-store/relationship-read";

export { collectSetNodeIds } from "tome-flatfile";

export type SetKind = "type_table" | "archive";

export function memberSetIds(
  store: RelationshipReadStore,
  memberId: string,
  contentDir?: string,
): string[] {
  const dir = contentDir ?? store.contentDir ?? resolveContentPath();
  const registry = loadAssociationsFromContent(dir);
  const ids = new Set<string>();
  for (const composite of typesWithTrait(registry, SET_TRAIT)) {
    const memberProjection = memberSideProjectionType(registry, composite);
    for (const rel of listRelationshipsFromSource(store, memberId, memberProjection)) {
      ids.add(rel.targetNodeId);
    }
  }
  return [...ids];
}

export function setMemberIds(
  store: RelationshipReadStore,
  setId: string,
  contentDir?: string,
): string[] {
  const dir = contentDir ?? store.contentDir ?? resolveContentPath();
  const registry = loadAssociationsFromContent(dir);
  const ids = new Set<string>();
  for (const composite of typesWithTrait(registry, SET_TRAIT)) {
    const setProjection = setSideProjectionType(registry, composite);
    const memberProjection = memberSideProjectionType(registry, composite);
    for (const rel of listRelationshipsFromSource(store, setId, setProjection)) {
      ids.add(rel.targetNodeId);
    }
    for (const rel of listRelationshipsToTarget(store, setId, memberProjection)) {
      ids.add(rel.sourceNodeId);
    }
  }
  return [...ids];
}

export function setKindForNode(
  store: RelationshipReadStore,
  nodeId: string,
  contentDir?: string,
): SetKind | null {
  const dir = contentDir ?? store.contentDir ?? resolveContentPath();
  const archiveId = archiveNodeId(dir);
  if (archiveId && nodeId === archiveId) return "archive";
  if (hasTableSchemaEntry(dir, nodeId)) return "type_table";
  if (setMemberIds(store, nodeId, dir).length > 0 || memberSetIds(store, nodeId, dir).length > 0) {
    return "type_table";
  }
  return null;
}

export function isSetNode(store: RelationshipReadStore, nodeId: string, contentDir?: string): boolean {
  return setKindForNode(store, nodeId, contentDir) !== null;
}

export function findSetEdge(
  store: RelationshipReadStore,
  memberId: string,
  setId: string,
  contentDir?: string,
): Relationship | null {
  const dir = contentDir ?? store.contentDir ?? resolveContentPath();
  const registry = loadAssociationsFromContent(dir);
  for (const composite of typesWithTrait(registry, SET_TRAIT)) {
    const memberProjection = memberSideProjectionType(registry, composite);
    const edge = listRelationshipsFromSource(store, memberId, memberProjection).find(
      (r) => r.targetNodeId === setId,
    );
    if (edge) return edge;
  }
  return null;
}

/** Set edges normalized for type-table row building (member as sourceNodeId). */
export function listSetMemberRowConnections(
  store: RelationshipReadStore,
  setId: string,
  contentDir?: string,
): Relationship[] {
  const dir = contentDir ?? store.contentDir ?? resolveContentPath();
  const registry = loadAssociationsFromContent(dir);
  const byMember = new Map<string, Relationship>();
  for (const composite of typesWithTrait(registry, SET_TRAIT)) {
    const setProjection = setSideProjectionType(registry, composite);
    const memberProjection = memberSideProjectionType(registry, composite);
    for (const r of listRelationshipsFromSource(store, setId, setProjection)) {
      byMember.set(r.targetNodeId, {
        ...r,
        sourceNodeId: r.targetNodeId,
        targetNodeId: setId,
      });
    }
    for (const r of listRelationshipsToTarget(store, setId, memberProjection)) {
      if (!byMember.has(r.sourceNodeId)) byMember.set(r.sourceNodeId, r);
    }
  }
  return [...byMember.values()];
}
