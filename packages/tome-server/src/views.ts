import type { TomeWriteContext } from "tome-db";
import {
  createView,
  deleteView,
  getNodeViews,
  updateView,
  updateRelationshipViewProperties,
  reorderViews,
  type ViewProperties,
  type ViewSortSpec,
} from "tome-db";
import { invalidateViewsCache } from "tome-db";

export interface ViewMutationInput {
  name?: string;
  sorts?: ViewSortSpec[];
  properties?: ViewProperties;
  hiddenColumns?: string[];
}

export function readNodeViews(ctx: TomeWriteContext, nodeId: string) {
  invalidateViewsCache();
  return getNodeViews(ctx.store, nodeId);
}

export function createRelationshipView(
  ctx: TomeWriteContext,
  nodeId: string,
  association: string,
  input: { name: string; sorts?: ViewSortSpec[]; properties?: ViewProperties },
) {
  invalidateViewsCache();
  ctx.sync.syncFile("views.json");
  return createView(ctx.store, nodeId, association, input);
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
  return updateView(ctx.store, nodeId, association, viewId, input);
}

export function deleteRelationshipView(
  ctx: TomeWriteContext,
  nodeId: string,
  association: string,
  viewId: string,
) {
  invalidateViewsCache();
  ctx.sync.syncFile("views.json");
  deleteView(ctx.store, nodeId, association, viewId);
}

export function patchRelationshipViews(
  ctx: TomeWriteContext,
  nodeId: string,
  association: string,
  input: { viewOrder?: string[]; properties?: ViewProperties },
) {
  invalidateViewsCache();
  ctx.sync.syncFile("views.json");
  const response: {
    views?: ReturnType<typeof reorderViews>;
    properties?: ViewProperties;
  } = {};
  if (input.viewOrder) {
    response.views = reorderViews(ctx.store, nodeId, association, input.viewOrder);
  }
  if (input.properties) {
    response.properties = updateRelationshipViewProperties(
      ctx.store,
      nodeId,
      association,
      input.properties,
    );
  }
  return response;
}
