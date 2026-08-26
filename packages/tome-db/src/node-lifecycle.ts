import type { TomeWriteContext } from "./content/write-context";
import {
  contentDirForGraphStore,
  flatfileBackendFromContext,
  syncAfterNodeWrite,
  syncAfterRelationshipsWrite,
} from "./content/write-context";
import { isArchivedNode } from "./archive-status";
import {
  listArchiveMemberIdsFromStore,
  markIncidentRelationshipsArchived,
  unmarkIncidentRelationshipsArchived,
} from "./relationship-archive";
import { setRoleProjectionTypesForNode } from "tome-flatfile";
import { archiveNodeId, protectedNodeIds } from "tome-flatfile";
import {
  writeStoreDeleteRelationship,
  writeStoreGetNode,
  writeStoreUpsertRelationship,
} from "./graph-store/relationship-write";
import type { NodeLifecycleError } from "tome-graph-interfaces";

export type { NodeLifecycleError } from "tome-graph-interfaces";

export function isProtectedNodeId(id: string, contentDir?: string): boolean {
  return protectedNodeIds(contentDir).has(id);
}

export function deleteNode(ctx: TomeWriteContext, id: string): NodeLifecycleError | null {
  const store = ctx.graphStore;
  const contentDir = contentDirForGraphStore(store, id);
  if (isProtectedNodeId(id, contentDir)) return "protected";
  if (!writeStoreGetNode(store, id)) return "not_found";
  store.deleteNode(id);
  syncAfterNodeWrite(ctx, id);
  syncAfterRelationshipsWrite(ctx);
  ctx.sync.syncNode(id);
  return null;
}

export function archiveNode(ctx: TomeWriteContext, id: string): NodeLifecycleError | null {
  const store = ctx.graphStore;
  const contentDir = contentDirForGraphStore(store, id);
  const hubId = archiveNodeId(contentDir);
  if (isProtectedNodeId(id, contentDir)) return "protected";
  if (!writeStoreGetNode(store, id)) return "not_found";
  if (isArchivedNode(store, id, contentDir)) return "already_archived";

  markIncidentRelationshipsArchived(flatfileBackendFromContext(ctx), id, hubId);
  const [, memberPerspective] = setRoleProjectionTypesForNode(hubId, contentDir);
  writeStoreUpsertRelationship(store, id, hubId, memberPerspective);
  store.archiveNodeFile(id);
  syncAfterNodeWrite(ctx, id);
  syncAfterRelationshipsWrite(ctx);
  return null;
}

export function unarchiveNode(ctx: TomeWriteContext, id: string): NodeLifecycleError | null {
  const store = ctx.graphStore;
  const contentDir = contentDirForGraphStore(store, id);
  const hubId = archiveNodeId(contentDir);
  if (isProtectedNodeId(id, contentDir)) return "protected";
  if (!writeStoreGetNode(store, id)) return "not_found";
  if (!isArchivedNode(store, id, contentDir)) return "not_archived";

  const [, memberPerspective] = setRoleProjectionTypesForNode(hubId, contentDir);
  writeStoreDeleteRelationship(store, id, hubId, memberPerspective);
  const stillArchivedIds = new Set(
    listArchiveMemberIdsFromStore(flatfileBackendFromContext(ctx), hubId),
  );
  unmarkIncidentRelationshipsArchived(
    flatfileBackendFromContext(ctx),
    id,
    stillArchivedIds,
    hubId,
  );
  store.unarchiveNodeFile(id);
  syncAfterNodeWrite(ctx, id);
  syncAfterRelationshipsWrite(ctx);
  return null;
}
