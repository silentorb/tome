import type { TomeWriteContext } from "./content/write-context";
import { syncAfterNodeWrite, syncAfterRelationshipsWrite } from "./content/write-context";
import { isArchivedNode } from "./archive-status";
import {
  listArchiveMemberIdsFromStore,
  markIncidentRelationshipsArchived,
  unmarkIncidentRelationshipsArchived,
} from "./relationship-archive";
import { membershipPerspectivesForSet } from "tome-flatfile";
import { archiveNodeId, protectedNodeIds } from "tome-flatfile";
import type { NodeLifecycleError } from "tome-graph-interfaces";

export type { NodeLifecycleError } from "tome-graph-interfaces";

export function isProtectedNodeId(id: string, contentDir?: string): boolean {
  return protectedNodeIds(contentDir).has(id);
}

export function deleteNode(ctx: TomeWriteContext, id: string): NodeLifecycleError | null {
  const contentDir = ctx.store.contentDir;
  if (isProtectedNodeId(id, contentDir)) return "protected";
  if (!ctx.store.readNode(id)) return "not_found";
  ctx.store.deleteNodeFile(id);
  ctx.store.removeIncidentRelationships(id);
  syncAfterNodeWrite(ctx, id);
  syncAfterRelationshipsWrite(ctx);
  ctx.sync.syncNode(id);
  return null;
}

export function archiveNode(ctx: TomeWriteContext, id: string): NodeLifecycleError | null {
  const contentDir = ctx.store.contentDir;
  const hubId = archiveNodeId(contentDir);
  if (isProtectedNodeId(id, contentDir)) return "protected";
  if (!ctx.store.readNode(id)) return "not_found";
  if (isArchivedNode(ctx.cache, id, contentDir)) return "already_archived";

  markIncidentRelationshipsArchived(ctx.store, id, hubId);
  const [, memberPerspective] = membershipPerspectivesForSet(hubId, contentDir);
  ctx.store.upsertRelationship(id, hubId, memberPerspective);
  syncAfterRelationshipsWrite(ctx);
  return null;
}

export function unarchiveNode(ctx: TomeWriteContext, id: string): NodeLifecycleError | null {
  const contentDir = ctx.store.contentDir;
  const hubId = archiveNodeId(contentDir);
  if (isProtectedNodeId(id, contentDir)) return "protected";
  if (!ctx.store.readNode(id)) return "not_found";
  if (!isArchivedNode(ctx.cache, id, contentDir)) return "not_archived";

  const [, memberPerspective] = membershipPerspectivesForSet(hubId, contentDir);
  ctx.store.deleteRelationship(id, hubId, memberPerspective);
  const stillArchivedIds = new Set(listArchiveMemberIdsFromStore(ctx.store, hubId));
  unmarkIncidentRelationshipsArchived(ctx.store, id, stillArchivedIds, hubId);
  syncAfterRelationshipsWrite(ctx);
  return null;
}
