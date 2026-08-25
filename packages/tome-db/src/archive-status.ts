import type { TomeGraphStoreBase } from "tome-graph-interfaces";
import {
  loadAssociationsFromContent,
  resolveContentPath,
  setTraitProjectionTypes,
} from "tome-flatfile";
import { findSetEdge, setMemberIds } from "./set-membership";
import { archiveNodeId, legacyArchivePathPrefix } from "tome-flatfile";
import {
  readStoreIsNodeArchived,
  type RelationshipReadStore,
} from "./graph-store/relationship-read";

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

/** True when the node has a set edge on the Archive hub (not the hub itself). */
export function isArchivedNode(
  store: RelationshipReadStore,
  nodeId: string,
  contentDir?: string,
): boolean {
  const dir = contentDir ?? resolveContentPath();
  const archiveId = resolveArchiveHubId(dir);
  if (archiveId && nodeId === archiveId) return false;
  if (readStoreIsNodeArchived(store, nodeId)) return true;
  if (!archiveId) return false;

  const registry = loadAssociationsFromContent(dir);
  if (setTraitProjectionTypes(registry).length === 0) return false;

  return findSetEdge(store, nodeId, archiveId, dir) !== null;
}

export function listArchivedNodeIds(store: RelationshipReadStore, contentDir?: string): string[] {
  const dir = contentDir ?? resolveContentPath();
  const archiveId = resolveArchiveHubId(dir);
  if (!archiveId) return [];
  const rows = setMemberIds(store, archiveId, dir);
  return rows.filter((id) => id !== archiveId);
}
