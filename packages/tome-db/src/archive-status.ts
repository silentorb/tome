import type { GraphDatabase } from "tome-sqlite";
import {
  loadAssociationsFromContent,
  resolveContentPath,
  setTraitPerspectives,
} from "tome-flatfile";
import { findSetMembershipRelationship, setMemberIds } from "./set-membership";
import { archiveNodeId, legacyArchivePathPrefix } from "tome-flatfile";

export function isLegacyArchivedPath(path: string | null, contentDir?: string): boolean {
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

  const registry = loadAssociationsFromContent(dir);
  if (setTraitPerspectives(registry).length === 0) return false;

  return findSetMembershipRelationship(db, nodeId, archiveId, dir) !== null;
}

export function listArchivedNodeIds(db: GraphDatabase, contentDir?: string): string[] {
  const dir = contentDir ?? resolveContentPath();
  const archiveId = resolveArchiveHubId(dir);
  if (!archiveId) return [];
  const rows = setMemberIds(db, archiveId, dir);
  if (rows.length > 0) return rows.filter((id) => id !== archiveId);
  return db.listArchiveMemberIds(archiveId, dir).filter((id) => id !== archiveId);
}
