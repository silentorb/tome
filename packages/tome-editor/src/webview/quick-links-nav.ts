import type { WorkspaceQuickLink } from "tome-db";
import type { AppView } from "../shared/types";
import { navigateStandaloneNode, openStandaloneNodeInNewTab } from "./node-links";

export const HOME_ICON = "⌂";

export const VIEW_ICONS: Record<Exclude<AppView, "node-page">, string> = {
  "graph-explorer": "⊕",
};

export function buildQuickLinkIconMaps(quickLinks: readonly WorkspaceQuickLink[]): {
  byNodeId: Readonly<Record<string, string>>;
  byLabel: Readonly<Record<string, string>>;
} {
  const byNodeId: Record<string, string> = {};
  const byLabel: Record<string, string> = {};
  for (const link of quickLinks) {
    byNodeId[link.nodeId] = link.icon;
    byLabel[link.label] = link.icon;
  }
  return { byNodeId, byLabel };
}

/** @deprecated Use buildQuickLinkIconMaps */
export const buildSidebarIconMaps = buildQuickLinkIconMaps;

export interface QuickLinkDragState {
  didDrag: boolean;
}

/** Navigate on pointerup when the gesture did not activate drag reorder. */
export function navigateQuickLinkPointerUp(
  event: PointerEvent | MouseEvent,
  nodeId: string,
  pageBase: string | undefined,
  dragState: QuickLinkDragState,
): boolean {
  if (event.button === 2) return false;

  if (dragState.didDrag) {
    dragState.didDrag = false;
    return false;
  }

  const openInNewTab = event.metaKey || event.ctrlKey || event.button === 1;
  if (openInNewTab) {
    openStandaloneNodeInNewTab(nodeId, pageBase);
  } else {
    navigateStandaloneNode(nodeId, pageBase);
  }
  return true;
}

export function navigateQuickLinkKeyboard(
  event: { key: string; preventDefault(): void },
  nodeId: string,
  pageBase: string | undefined,
): boolean {
  if (event.key !== "Enter" && event.key !== " ") return false;
  event.preventDefault();
  navigateStandaloneNode(nodeId, pageBase);
  return true;
}
