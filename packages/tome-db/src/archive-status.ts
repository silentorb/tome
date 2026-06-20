import type { GraphDatabase } from "./graph";
import { INCLUDES_TYPE } from "./includes-relationship";
import { resolveContentPath } from "./content/paths";
import { archiveNodeId, legacyArchivePathPrefix } from "./workspace/resolve";

export function isLegacyArchivedNotionPath(path: string | null, contentDir?: string): boolean {
  if (!path) return false;
  const prefix = legacyArchivePathPrefix(contentDir);
  if (!prefix) return false;
  return path === prefix || path.startsWith(`${prefix}/`);
}

function includesArchiveHub(
  archiveId: string,
  nodeId: string,
  connection: { sourceNodeId: string; targetNodeId: string },
): boolean {
  const other =
    connection.sourceNodeId === nodeId ? connection.targetNodeId : connection.sourceNodeId;
  return other === archiveId;
}

/** True when the node has an `includes` edge to the Archive hub (not the hub itself). */
export function isArchivedNode(
  db: GraphDatabase,
  nodeId: string,
  contentDir?: string,
): boolean {
  const dir = contentDir ?? resolveContentPath();
  const archiveId = archiveNodeId(dir);
  if (nodeId === archiveId) return false;
  if (db.isNodeArchived(nodeId)) return true;
  for (const connection of db.listRelationshipsFromSource(nodeId, INCLUDES_TYPE)) {
    if (includesArchiveHub(archiveId, nodeId, connection)) return true;
  }
  for (const connection of db.listRelationshipsToTarget(nodeId, INCLUDES_TYPE)) {
    if (includesArchiveHub(archiveId, nodeId, connection)) return true;
  }
  return false;
}

export function listArchivedNodeIds(db: GraphDatabase, contentDir?: string): string[] {
  const dir = contentDir ?? resolveContentPath();
  const archiveId = archiveNodeId(dir);
  const rows = db.listIncludesArchiveMemberIds(archiveId);
  return rows.filter((id) => id !== archiveId);
}
