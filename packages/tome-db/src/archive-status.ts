import type { GraphDatabase } from "./graph";
import { resolveContentPath } from "./content/paths";
import { SET_MEMBERSHIP_TYPE, listSetMembership } from "./set-membership";
import { archiveNodeId, legacyArchivePathPrefix } from "./workspace/resolve";

export function isLegacyArchivedNotionPath(path: string | null, contentDir?: string): boolean {
  if (!path) return false;
  const prefix = legacyArchivePathPrefix(contentDir);
  if (!prefix) return false;
  return path === prefix || path.startsWith(`${prefix}/`);
}

function resolveArchiveHubId(contentDir?: string): string | null {
  try {
    return archiveNodeId(contentDir);
  } catch {
    return null;
  }
}

function isArchiveHubEndpoint(archiveId: string, nodeId: string, otherId: string): boolean {
  return otherId === archiveId && nodeId !== archiveId;
}

/** True when the node has set membership on the Archive hub (not the hub itself). */
export function isArchivedNode(
  db: GraphDatabase,
  nodeId: string,
  contentDir?: string,
): boolean {
  const dir = contentDir ?? resolveContentPath();
  const archiveId = resolveArchiveHubId(dir);
  if (archiveId && nodeId === archiveId) return false;
  if (db.isNodeArchived(nodeId)) return true;
  if (!archiveId) return false;

  for (const connection of listSetMembership(db, nodeId, SET_MEMBERSHIP_TYPE)) {
    if (isArchiveHubEndpoint(archiveId, nodeId, connection.targetNodeId)) return true;
  }
  for (const connection of db.listRelationshipsToTarget(nodeId, SET_MEMBERSHIP_TYPE)) {
    if (isArchiveHubEndpoint(archiveId, nodeId, connection.sourceNodeId)) return true;
  }
  return false;
}

export function listArchivedNodeIds(db: GraphDatabase, contentDir?: string): string[] {
  const dir = contentDir ?? resolveContentPath();
  const archiveId = resolveArchiveHubId(dir);
  if (!archiveId) return [];
  const rows = setMemberIds(db, archiveId);
  if (rows.length > 0) return rows.filter((id) => id !== archiveId);
  return db.listArchiveMemberIds(archiveId).filter((id) => id !== archiveId);
}
