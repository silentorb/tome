import type { TomeWriteContext } from "tome-db";
import {
  createView,
  deleteView,
  getNodeViews,
  updateView,
  updateRelationshipViewProperties,
  reorderViews,
  type ViewSortSpec,
} from "tome-db";
import { invalidateViewsCache } from "tome-db";

export interface ViewMutationInput {
  name?: string;
  sorts?: ViewSortSpec[];
  properties?: string[];
}

export function readNodeViews(ctx: TomeWriteContext, nodeId: string) {
  invalidateViewsCache();
  return getNodeViews(ctx.graphStore, nodeId);
}

export async function createRelationshipView(
  ctx: TomeWriteContext,
  nodeId: string,
  relationshipTypeId: string,
  input: { name: string; sorts?: ViewSortSpec[]; properties?: string[] },
) {
  invalidateViewsCache();
  await ctx.sync.syncFile("views.json");
  return createView(ctx.graphStore, nodeId, relationshipTypeId, input);
}

export async function updateRelationshipView(
  ctx: TomeWriteContext,
  nodeId: string,
  relationshipTypeId: string,
  viewId: string,
  input: ViewMutationInput,
) {
  invalidateViewsCache();
  await ctx.sync.syncFile("views.json");
  return updateView(ctx.graphStore, nodeId, relationshipTypeId, viewId, input);
}

export async function deleteRelationshipView(
  ctx: TomeWriteContext,
  nodeId: string,
  relationshipTypeId: string,
  viewId: string,
) {
  invalidateViewsCache();
  await ctx.sync.syncFile("views.json");
  await deleteView(ctx.graphStore, nodeId, relationshipTypeId, viewId);
}

export async function patchRelationshipViews(
  ctx: TomeWriteContext,
  nodeId: string,
  relationshipTypeId: string,
  input: { viewOrder?: string[]; properties?: string[] },
) {
  invalidateViewsCache();
  await ctx.sync.syncFile("views.json");
  const response: {
    views?: Awaited<ReturnType<typeof reorderViews>>;
    properties?: string[];
  } = {};
  if (input.viewOrder) {
    response.views = await reorderViews(
      ctx.graphStore,
      nodeId,
      relationshipTypeId,
      input.viewOrder,
    );
  }
  if (input.properties) {
    response.properties = await updateRelationshipViewProperties(
      ctx.graphStore,
      nodeId,
      relationshipTypeId,
      input.properties,
    );
  }
  return response;
}
