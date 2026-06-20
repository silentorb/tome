import type { SidebarLink } from "tome-db";
import type { AppView } from "../shared/types";

export interface SidebarNodeLink {
  id: string;
  label: string;
  icon: string;
}

export const HOME_ICON = "⌂";

export const VIEW_ICONS: Record<Exclude<AppView, "node-page">, string> = {
  "graph-explorer": "⊕",
};

export function buildSidebarIconMaps(links: readonly SidebarLink[]): {
  byNodeId: Readonly<Record<string, string>>;
  byLabel: Readonly<Record<string, string>>;
} {
  const byNodeId: Record<string, string> = {};
  const byLabel: Record<string, string> = {};
  for (const link of links) {
    byNodeId[link.nodeId] = link.icon;
    byLabel[link.label] = link.icon;
  }
  return { byNodeId, byLabel };
}
