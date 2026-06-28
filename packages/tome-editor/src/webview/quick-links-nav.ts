import type { WorkspaceQuickLink } from "tome-db";
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
