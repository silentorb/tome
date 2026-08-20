import type { WorkspaceQuickLink } from "tome-graph-interfaces";
import type { AppView } from "../shared/types";

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

/** Suppress anchor navigation when dnd-kit emits a synthetic click after reorder. */
export function suppressNavigationClickAfterDragReorder(
  event: Pick<MouseEvent, "preventDefault">,
  dragCompleted: { current: boolean },
): void {
  if (!dragCompleted.current) return;
  event.preventDefault();
  dragCompleted.current = false;
}
