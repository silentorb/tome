import { useEffect, useState } from "react";
import type { AppView, NodeSummary } from "../../shared/types";
import type { EditorApi } from "../api/client";
import { resolveDocumentIcon } from "../document-icon";
import { useUserSettings } from "../hooks/useUserSettings";
import { nodePageHref } from "../node-links";

interface RecentNodesPanelProps {
  api: EditorApi;
  activeView: AppView;
  activeNodeId?: string | null;
  homeNodeId?: string | null;
  collapsed: boolean;
  refreshKey: number;
  pageBase?: string;
}

function NavItem({
  active,
  title,
  icon,
  label,
  href,
}: {
  active: boolean;
  title: string;
  icon: string;
  label: string;
  href: string;
}) {
  return (
    <a className={`tome-side-panel-item${active ? " is-active" : ""}`} href={href} title={title}>
      <span className="tome-side-panel-item-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="tome-side-panel-item-label">{label}</span>
    </a>
  );
}

export function RecentNodesPanel({
  api,
  activeView,
  activeNodeId,
  homeNodeId,
  collapsed,
  refreshKey,
  pageBase,
}: RecentNodesPanelProps) {
  const { sidebarRecentMaxItems } = useUserSettings();
  const [nodes, setNodes] = useState<NodeSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    void api
      .listRecent(sidebarRecentMaxItems)
      .then((items) => {
        if (!cancelled) setNodes(items);
      })
      .catch(() => {
        if (!cancelled) setNodes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [api, refreshKey, sidebarRecentMaxItems]);

  if (nodes.length === 0) return null;

  return (
    <>
      <div className="tome-side-panel-divider" role="presentation" />
      <div
        className={`tome-side-panel-section${collapsed ? " is-collapsed" : ""}`}
        aria-label="Recent nodes"
      >
        <div className="tome-side-panel-section-label">Recent</div>
        {nodes.map((item) => (
          <NavItem
            key={item.id}
            active={activeView === "node-page" && activeNodeId === item.id}
            title={item.title}
            icon={resolveDocumentIcon({
              view: "node-page",
              nodeId: item.id,
              primaryTypeTitle: item.primaryTypeTitle,
              homeId: homeNodeId,
            })}
            label={item.title}
            href={nodePageHref(item.id, pageBase)}
          />
        ))}
      </div>
    </>
  );
}
