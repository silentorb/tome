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

export async function deleteNode(ctx: TomeWriteContext, id: string): Promise<NodeLifecycleError | null> {
  const store = ctx.graphStore;
  const contentDir = contentDirForGraphStore(store, id);
  if (isProtectedNodeId(id, contentDir)) return "protected";
  if (!await writeStoreGetNode(store, id)) return "not_found";
  await store.deleteNode(id);
  await syncAfterNodeWrite(ctx, id);
  await syncAfterRelationshipsWrite(ctx);
  await ctx.sync.syncNode(id);
  return null;
}

export async function archiveNode(ctx: TomeWriteContext, id: string): Promise<NodeLifecycleError | null> {
  const store = ctx.graphStore;
  const contentDir = contentDirForGraphStore(store, id);
  const hubId = archiveNodeId(contentDir);
  if (isProtectedNodeId(id, contentDir)) return "protected";
  if (!await writeStoreGetNode(store, id)) return "not_found";
  if (await isArchivedNode(store, id, contentDir)) return "already_archived";

  markIncidentRelationshipsArchived(flatfileBackendFromContext(ctx), id, hubId);
  const [, memberPerspective] = setRoleProjectionTypesForNode(hubId, contentDir);
  await writeStoreUpsertRelationship(store, id, hubId, memberPerspective);
  await store.archiveNodeFile(id);
  await syncAfterNodeWrite(ctx, id);
  await syncAfterRelationshipsWrite(ctx);
  return null;
}

export async function unarchiveNode(ctx: TomeWriteContext, id: string): Promise<NodeLifecycleError | null> {
  const store = ctx.graphStore;
  const contentDir = contentDirForGraphStore(store, id);
  const hubId = archiveNodeId(contentDir);
  if (isProtectedNodeId(id, contentDir)) return "protected";
  if (!await writeStoreGetNode(store, id)) return "not_found";
  if (!await isArchivedNode(store, id, contentDir)) return "not_archived";

  const [, memberPerspective] = setRoleProjectionTypesForNode(hubId, contentDir);
  await writeStoreDeleteRelationship(store, id, hubId, memberPerspective);
  const stillArchivedIds = new Set(
    listArchiveMemberIdsFromStore(flatfileBackendFromContext(ctx), hubId),
  );
  unmarkIncidentRelationshipsArchived(
    flatfileBackendFromContext(ctx),
    id,
    stillArchivedIds,
    hubId,
  );
  await store.unarchiveNodeFile(id);
  await syncAfterNodeWrite(ctx, id);
  await syncAfterRelationshipsWrite(ctx);
  return null;
}
