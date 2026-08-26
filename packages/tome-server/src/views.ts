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

export function createRelationshipView(
  ctx: TomeWriteContext,
  nodeId: string,
  association: string,
  input: { name: string; sorts?: ViewSortSpec[]; properties?: string[] },
) {
  invalidateViewsCache();
  ctx.sync.syncFile("views.json");
  return createView(ctx.graphStore, nodeId, association, input);
}

export function updateRelationshipView(
  ctx: TomeWriteContext,
  nodeId: string,
  association: string,
  viewId: string,
  input: ViewMutationInput,
) {
  invalidateViewsCache();
  ctx.sync.syncFile("views.json");
  return updateView(ctx.graphStore, nodeId, association, viewId, input);
}

export function deleteRelationshipView(
  ctx: TomeWriteContext,
  nodeId: string,
  association: string,
  viewId: string,
) {
  invalidateViewsCache();
  ctx.sync.syncFile("views.json");
  deleteView(ctx.graphStore, nodeId, association, viewId);
}

export function patchRelationshipViews(
  ctx: TomeWriteContext,
  nodeId: string,
  association: string,
  input: { viewOrder?: string[]; properties?: string[] },
) {
  invalidateViewsCache();
  ctx.sync.syncFile("views.json");
  const response: {
    views?: ReturnType<typeof reorderViews>;
    properties?: string[];
  } = {};
  if (input.viewOrder) {
    response.views = reorderViews(ctx.graphStore, nodeId, association, input.viewOrder);
  }
  if (input.properties) {
    response.properties = updateRelationshipViewProperties(
      ctx.graphStore,
      nodeId,
      association,
      input.properties,
    );
  }
  return response;
}
