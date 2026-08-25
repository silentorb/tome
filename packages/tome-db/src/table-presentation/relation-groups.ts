import type { Relationship } from "tome-graph-interfaces";
import { relationshipId } from "tome-sqlite";
import {
  listRelationshipsToTarget,
  readStoreGetRelationship,
  type RelationshipReadStore,
} from "../graph-store/relationship-read";
import {
  ORDERED_PROPERTY_DEFAULT,
  resolveContentPath,
  setRoleProjectionTypesForNode,
} from "tome-flatfile";
import {
  firstRelatedNodeId,
  relatedNodeIds,
} from "../relationship-traverse";
import type {
  DatabaseRow,
  DatabaseRowGroup,
  RelationGroupsLayerConfig,
} from "tome-graph-interfaces";
import { UNASSIGNED_GROUP_ID } from "tome-graph-interfaces";
import { numericSortKey, nodeTitle, titleFromProperties } from "./helpers";

export interface GroupHeader {
  id: string;
  title: string;
  sortKey: number;
}

function groupSortKey(
  db: RelationshipReadStore,
  groupId: string,
  groupTypeDatabaseId: string,
  contentDir: string,
): number {
  const [, memberPerspective] = setRoleProjectionTypesForNode(groupTypeDatabaseId, contentDir);
  const edge = readStoreGetRelationship(db, relationshipId(groupId, memberPerspective, groupTypeDatabaseId), {
    sourceNodeId: groupId,
    targetNodeId: groupTypeDatabaseId,
    type: memberPerspective,
  });
  if (edge) {
    return numericSortKey(edge.properties[ORDERED_PROPERTY_DEFAULT], 999);
  }
  return 999;
}

/** Group-table members relevant to the optional active scope. */
export function groupsForScope(
  db: RelationshipReadStore,
  config: RelationGroupsLayerConfig,
  scopeId: string | undefined,
  contentDir?: string,
): GroupHeader[] {
  const dir = contentDir ?? resolveContentPath();
  const groups: GroupHeader[] = [];
  const [, memberPerspective] = setRoleProjectionTypesForNode(config.groupTypeDatabaseId, dir);

  for (const connection of listRelationshipsToTarget(
    db,
    config.groupTypeDatabaseId,
    memberPerspective,
  )) {
    const groupId = connection.sourceNodeId;
    if (scopeId && config.groupToScopeComposite) {
      const scopeIds = relatedNodeIds(db, groupId, config.groupToScopeComposite);
      if (!scopeIds.includes(scopeId)) continue;
    }

    groups.push({
      id: groupId,
      title: nodeTitle(db, groupId),
      sortKey: groupSortKey(db, groupId, config.groupTypeDatabaseId, dir),
    });
  }

  const byId = new Map<string, GroupHeader>();
  for (const group of groups) byId.set(group.id, group);
  return [...byId.values()].sort((a, b) => {
    if (a.sortKey !== b.sortKey) return a.sortKey - b.sortKey;
    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  });
}

function canonicalGroupIdForTitle(
  scopeGroups: GroupHeader[],
  title: string,
): string | null {
  const normalized = title.trim().toLowerCase();
  if (!normalized) return null;
  const match = scopeGroups.find((group) => group.title.trim().toLowerCase() === normalized);
  return match?.id ?? null;
}

/** Resolve which group a member belongs to, tolerating duplicate group vertices from import. */
export function resolveMemberGroupId(
  db: RelationshipReadStore,
  config: RelationGroupsLayerConfig,
  memberId: string,
  scopeGroups: GroupHeader[],
): string | null {
  const scopeGroupIds = new Set(scopeGroups.map((group) => group.id));
  const target = firstRelatedNodeId(db, memberId, config.memberToGroupComposite);

  if (!target) return null;
  if (scopeGroupIds.has(target)) return target;

  if (config.canonicalGroupByTitle !== false) {
    const vertex = db.getNode(target);
    if (vertex) {
      const canonicalId = canonicalGroupIdForTitle(
        scopeGroups,
        titleFromProperties(vertex.properties),
      );
      if (canonicalId) return canonicalId;
    }
  }

  return null;
}

export function buildRelationGroups(
  db: RelationshipReadStore,
  config: RelationGroupsLayerConfig,
  scopeId: string | undefined,
  rows: DatabaseRow[],
  memberGroupIds: Map<string, string | null>,
  contentDir?: string,
): DatabaseRowGroup[] {
  const dir = contentDir ?? resolveContentPath();
  const headers = groupsForScope(db, config, scopeId, dir);
  const rowsByGroup = new Map<string | null, DatabaseRow[]>();

  for (const row of rows) {
    const key = memberGroupIds.get(row.nodeId) ?? null;
    const list = rowsByGroup.get(key) ?? [];
    list.push(row);
    rowsByGroup.set(key, list);
  }

  const groups: DatabaseRowGroup[] = [];

  for (const header of headers) {
    groups.push({
      groupId: header.id,
      title: header.title,
      rows: rowsByGroup.get(header.id) ?? [],
    });
    rowsByGroup.delete(header.id);
  }

  const unassigned = rowsByGroup.get(null) ?? [];
  for (const [groupId, orphaned] of rowsByGroup) {
    if (groupId !== null) unassigned.push(...orphaned);
  }

  groups.push({
    groupId: UNASSIGNED_GROUP_ID,
    title: config.unassignedGroupTitle,
    rows: unassigned,
  });

  return groups;
}

export function windowRelationGroups(
  groups: DatabaseRowGroup[],
  windowedRows: DatabaseRow[],
  includeEmptyGroups: boolean,
): DatabaseRowGroup[] {
  const byId = new Map<string, DatabaseRowGroup>();
  const rowGroupId = new Map<string, string>();
  for (const group of groups) {
    for (const row of group.rows) {
      rowGroupId.set(row.nodeId, group.groupId);
    }
  }

  for (const row of windowedRows) {
    const groupId = rowGroupId.get(row.nodeId);
    if (!groupId) continue;
    const source = groups.find((g) => g.groupId === groupId);
    if (!source) continue;
    let group = byId.get(groupId);
    if (!group) {
      group = { groupId, title: source.title, rows: [] };
      byId.set(groupId, group);
    }
    group.rows.push(row);
  }

  const ordered: DatabaseRowGroup[] = [];
  for (const group of groups) {
    const windowed = byId.get(group.groupId);
    if (windowed) {
      ordered.push(windowed);
    } else if (includeEmptyGroups) {
      ordered.push({ groupId: group.groupId, title: group.title, rows: [] });
    }
  }
  return ordered;
}

/** Set-membership edges used when rewriting order for a filtered member list. */
export function membershipEdgesForMembers(
  members: Relationship[],
  memberIds: Set<string>,
): Relationship[] {
  return members.filter((edge) => memberIds.has(edge.sourceNodeId));
}
