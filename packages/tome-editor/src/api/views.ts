import type { TomeWriteContext } from "tome-db";
import {
  createTab,
  deleteTab,
  getNodeViews,
  updateTab,
  updateSectionColumnOrder,
  reorderSectionTabs,
  type ViewSortSpec,
} from "tome-db";
import { invalidateViewsCache } from "tome-db";
import { ITEMS_SECTION_KEY } from "tome-db";

export interface TabMutationInput {
  name?: string;
  sorts?: ViewSortSpec[];
}

export function readNodeViews(ctx: TomeWriteContext, nodeId: string) {
  invalidateViewsCache();
  return getNodeViews(ctx.store, nodeId);
}

export function createSectionTab(
  ctx: TomeWriteContext,
  nodeId: string,
  sectionKey: string,
  input: { name: string; sorts?: ViewSortSpec[] },
) {
  invalidateViewsCache();
  ctx.sync.syncFile("views.json");
  return createTab(ctx.store, nodeId, sectionKey, input);
}

export function updateSectionTab(
  ctx: TomeWriteContext,
  nodeId: string,
  sectionKey: string,
  tabId: string,
  input: TabMutationInput,
) {
  invalidateViewsCache();
  ctx.sync.syncFile("views.json");
  return updateTab(ctx.store, nodeId, sectionKey, tabId, input);
}

export function deleteSectionTab(
  ctx: TomeWriteContext,
  nodeId: string,
  sectionKey: string,
  tabId: string,
) {
  invalidateViewsCache();
  ctx.sync.syncFile("views.json");
  deleteTab(ctx.store, nodeId, sectionKey, tabId);
}

export function patchSectionColumnOrder(
  ctx: TomeWriteContext,
  nodeId: string,
  sectionKey: string,
  columnOrder: string[],
) {
  invalidateViewsCache();
  ctx.sync.syncFile("views.json");
  return updateSectionColumnOrder(ctx.store, nodeId, sectionKey, columnOrder);
}

export function patchSectionTabOrder(
  ctx: TomeWriteContext,
  nodeId: string,
  sectionKey: string,
  tabOrder: string[],
) {
  invalidateViewsCache();
  ctx.sync.syncFile("views.json");
  return reorderSectionTabs(ctx.store, nodeId, sectionKey, tabOrder);
}

export { ITEMS_SECTION_KEY };
