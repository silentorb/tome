import type { ContentStore, CompositeStore } from "tome-flatfile";
import type { RelationshipEntry } from "tome-flatfile";
import { isSetTraitComposite, loadAssociationsFromContent } from "tome-flatfile";
import { archiveNodeId } from "tome-flatfile";

type FlatfileStoreLike = ContentStore | CompositeStore;

export function isArchiveSetEntry(
  entry: RelationshipEntry,
  archiveHubId: string,
  contentDir?: string,
): boolean {
  const registry = loadAssociationsFromContent(contentDir);
  if (!isSetTraitComposite(registry, entry.type)) return false;
  return entry.a === archiveHubId || entry.b === archiveHubId;
}

export function listArchiveMemberIds(
  entries: readonly RelationshipEntry[],
  archiveHubId: string,
  contentDir?: string,
): string[] {
  const members = new Set<string>();
  for (const entry of entries) {
    if (!isArchiveSetEntry(entry, archiveHubId, contentDir)) continue;
    const memberId = entry.a === archiveHubId ? entry.b : entry.a;
    if (memberId !== archiveHubId) members.add(memberId);
  }
  return [...members];
}

export function isIncidentEntry(entry: RelationshipEntry, nodeId: string): boolean {
  return entry.a === nodeId || entry.b === nodeId;
}

export function otherEndpoint(entry: RelationshipEntry, nodeId: string): string {
  return entry.a === nodeId ? entry.b : entry.a;
}

/**
 * @deprecated Live-tree reads already exclude archived edges; kept for call-site clarity.
 */
export function filterEntriesForCacheSync(entries: readonly RelationshipEntry[]): RelationshipEntry[] {
  return [...entries];
}

export function markIncidentRelationshipsArchived(
  store: FlatfileStoreLike,
  nodeId: string,
  archiveHubId: string,
): number {
  let changed = 0;

  for (const entry of store.readRelationshipsFile().relationships) {
    if (!isIncidentEntry(entry, nodeId)) continue;
    if (isArchiveSetEntry(entry, archiveHubId, store.contentDir)) continue;
    if (store.moveRelationshipToArchive(entry.a, entry.b, entry.type)) {
      changed++;
    }
  }

  return changed;
}

export function unmarkIncidentRelationshipsArchived(
  store: FlatfileStoreLike,
  nodeId: string,
  stillArchivedIds: ReadonlySet<string>,
  archiveHubId: string,
): number {
  let changed = 0;

  for (const entry of store.readArchivedRelationships()) {
    if (!isIncidentEntry(entry, nodeId)) continue;
    if (isArchiveSetEntry(entry, archiveHubId, store.contentDir)) continue;

    const other = otherEndpoint(entry, nodeId);
    if (stillArchivedIds.has(other)) continue;

    if (store.moveRelationshipFromArchive(entry.a, entry.b, entry.type)) {
      changed++;
    }
  }

  return changed;
}

export function listArchiveMemberIdsFromStore(store: FlatfileStoreLike, archiveHubId?: string): string[] {
  const hubId = archiveHubId ?? archiveNodeId(store.contentDir);
  return listArchiveMemberIds(store.readRelationshipsFile().relationships, hubId, store.contentDir);
}
