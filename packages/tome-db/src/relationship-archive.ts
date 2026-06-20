import type { ContentStore } from "./content/store";
import type { RelationshipEntry } from "./content/relationships-file";
import { INCLUDES_TYPE } from "./includes-relationship";
import { archiveNodeId } from "./workspace/resolve";

export function isArchiveMembershipEntry(
  entry: RelationshipEntry,
  archiveHubId: string,
): boolean {
  if (entry.type !== INCLUDES_TYPE) return false;
  return entry.a === archiveHubId || entry.b === archiveHubId;
}

export function listArchiveMemberIds(
  entries: readonly RelationshipEntry[],
  archiveHubId: string,
): string[] {
  const members = new Set<string>();
  for (const entry of entries) {
    if (!isArchiveMembershipEntry(entry, archiveHubId)) continue;
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

export function filterEntriesForCacheSync(entries: readonly RelationshipEntry[]): RelationshipEntry[] {
  return entries.filter((entry) => entry.archived !== true);
}

export function markIncidentRelationshipsArchived(
  store: ContentStore,
  nodeId: string,
  archiveHubId: string,
): number {
  const file = store.readRelationshipsFile();
  let changed = 0;

  for (let i = 0; i < file.relationships.length; i++) {
    const entry = file.relationships[i]!;
    if (!isIncidentEntry(entry, nodeId)) continue;
    if (isArchiveMembershipEntry(entry, archiveHubId)) continue;
    if (entry.archived === true) continue;
    file.relationships[i] = { ...entry, archived: true };
    changed++;
  }

  if (changed > 0) store.writeRelationshipsFile(file);
  return changed;
}

export function unmarkIncidentRelationshipsArchived(
  store: ContentStore,
  nodeId: string,
  stillArchivedIds: ReadonlySet<string>,
  archiveHubId: string,
): number {
  const file = store.readRelationshipsFile();
  let changed = 0;

  for (let i = 0; i < file.relationships.length; i++) {
    const entry = file.relationships[i]!;
    if (!isIncidentEntry(entry, nodeId)) continue;
    if (isArchiveMembershipEntry(entry, archiveHubId)) continue;
    if (entry.archived !== true) continue;

    const other = otherEndpoint(entry, nodeId);
    if (stillArchivedIds.has(other)) continue;

    const { archived: _removed, ...rest } = entry;
    file.relationships[i] = rest;
    changed++;
  }

  if (changed > 0) store.writeRelationshipsFile(file);
  return changed;
}

export function listArchiveMemberIdsFromStore(store: ContentStore, archiveHubId?: string): string[] {
  const hubId = archiveHubId ?? archiveNodeId(store.contentDir);
  return listArchiveMemberIds(store.readRelationshipsFile().relationships, hubId);
}
