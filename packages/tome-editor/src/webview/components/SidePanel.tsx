import { useState } from "react";
import type { WorkspaceQuickLink } from "tome-graph-interfaces";
import type { TomeCorpusPublic } from "../../shared/http-client";
import type { AppView } from "../../shared/types";
import type { EditorApi } from "../api/client";
import { nodePageHref } from "../node-links";
import { HOME_ICON, VIEW_ICONS } from "../quick-links-nav";
import { QuickLinksPanel } from "./QuickLinksPanel";
import { RecentNodesPanel } from "./RecentNodesPanel";
import "./side-panel.css";

export interface SidePanelStandaloneUrls {
  home: string;
  explorer: string;
  create: string;
  nodes: Record<string, string>;
}

export function isHomeNavActive(
  activeView: AppView,
  activeNodeId: string | null | undefined,
  homeNodeId: string | null | undefined,
): boolean {
  if (activeView !== "node-page" || !activeNodeId || !homeNodeId) return false;
  return activeNodeId === homeNodeId;
}

interface SidePanelProps {
  api: EditorApi;
  activeView: AppView;
  activeNodeId?: string | null;
  homeNodeId?: string | null;
  corpora?: readonly TomeCorpusPublic[];
  activeCorpusId?: string | null;
  onCorpusChange?: (corpusId: string) => void;
  corpusReadonly?: boolean;
  onViewChange: (view: AppView) => void;
  onNewPage: () => void;
  onOpenSearch: () => void;
  standaloneUrls?: SidePanelStandaloneUrls;
  recentNodesRefreshKey?: number;
  quickLinks?: readonly WorkspaceQuickLink[];
  protectedNodeIds?: readonly string[];
  archiveHubTitle?: string;
  activeNodeArchived?: boolean;
  onRemoveQuickLink?: (nodeId: string) => void | Promise<void>;
  onQuickLinksReorder?: (nodeIds: string[]) => void | Promise<void>;
  onArchiveNode?: (nodeId: string) => Promise<void>;
  onUnarchiveNode?: (nodeId: string) => Promise<void>;
  onDeleteNode?: (nodeId: string) => Promise<void>;
}

function NavItem({
  active,
  title,
  icon,
  label,
  href,
  onClick,
}: {
  active: boolean;
  title: string;
  icon: string;
  label: string;
  href?: string;
  onClick?: () => void;
}) {
  const className = `tome-side-panel-item${active ? " is-active" : ""}`;
  if (href) {
    return (
      <a className={className} href={href} title={title}>
        <span className="tome-side-panel-item-icon" aria-hidden="true">
          {icon}
        </span>
        <span className="tome-side-panel-item-label">{label}</span>
      </a>
    );
  }
  return (
    <button type="button" className={className} onClick={onClick} title={title}>
      <span className="tome-side-panel-item-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="tome-side-panel-item-label">{label}</span>
    </button>
  );
}

export function SidePanel({
  api,
  activeView,
  activeNodeId,
  homeNodeId,
  corpora = [],
  activeCorpusId = null,
  onCorpusChange,
  corpusReadonly = false,
  onViewChange,
  onNewPage,
  onOpenSearch,
  standaloneUrls,
  recentNodesRefreshKey = 0,
  quickLinks = [],
  protectedNodeIds = [],
  archiveHubTitle,
  activeNodeArchived = false,
  onRemoveQuickLink,
  onQuickLinksReorder,
  onArchiveNode,
  onUnarchiveNode,
  onDeleteNode,
}: SidePanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const pageBase = typeof window !== "undefined" ? window.location.href : undefined;

  const homeHref =
    standaloneUrls?.home ??
    (homeNodeId ? nodePageHref(homeNodeId, pageBase) : undefined);

  const showCorpusSwitcher = corpora.length > 1;

  return (
    <aside
      className={`tome-side-panel${collapsed ? " is-collapsed" : ""}`}
      aria-label="Navigation"
    >
      <div className="tome-side-panel-header">
        {showCorpusSwitcher && !collapsed ? (
          <label className="tome-side-panel-corpus">
            <span className="tome-side-panel-corpus-label">Corpus</span>
            <select
              className="tome-side-panel-corpus-select"
              value={activeCorpusId ?? ""}
              aria-label="Active corpus"
              onChange={(event) => {
                const next = event.target.value;
                if (next) onCorpusChange?.(next);
              }}
            >
              {corpora.map((corpus) => (
                <option key={corpus.id} value={corpus.id}>
                  {corpus.label}
                  {corpus.access === "readonly" ? " (read-only)" : ""}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button
          type="button"
          className="tome-side-panel-toggle"
          onClick={() => setCollapsed((value) => !value)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <span className="tome-side-panel-toggle-icon" aria-hidden="true">
            {collapsed ? "›" : "‹"}
          </span>
        </button>
      </div>
      <nav className="tome-side-panel-nav">
        <NavItem
          active={isHomeNavActive(activeView, activeNodeId, homeNodeId)}
          title="Home"
          icon={HOME_ICON}
          label="Home"
          href={homeHref}
        />
        <NavItem
          active={false}
          title="Search nodes (Ctrl+K)"
          icon="⌕"
          label="Search"
          onClick={onOpenSearch}
        />
        <NavItem
          active={activeView === "graph-explorer"}
          title="Graph Explorer"
          icon={VIEW_ICONS["graph-explorer"]}
          label="Graph Explorer"
          href={standaloneUrls?.explorer}
          onClick={standaloneUrls ? undefined : () => onViewChange("graph-explorer")}
        />
        {!corpusReadonly ? (
          <NavItem
            active={false}
            title="New page"
            icon="+"
            label="New page"
            href={standaloneUrls?.create}
            onClick={standaloneUrls ? undefined : onNewPage}
          />
        ) : null}
        <QuickLinksPanel
          api={api}
          quickLinks={quickLinks}
          activeView={activeView}
          activeNodeId={activeNodeId}
          activeNodeArchived={activeNodeArchived}
          collapsed={collapsed}
          standaloneUrls={standaloneUrls}
          pageBase={pageBase}
          protectedNodeIds={protectedNodeIds}
          archiveHubTitle={archiveHubTitle}
          onRemoveQuickLink={corpusReadonly ? undefined : onRemoveQuickLink}
          onQuickLinksReorder={corpusReadonly ? undefined : onQuickLinksReorder}
          onArchiveNode={corpusReadonly ? undefined : onArchiveNode}
          onUnarchiveNode={corpusReadonly ? undefined : onUnarchiveNode}
          onDeleteNode={corpusReadonly ? undefined : onDeleteNode}
        />
        <RecentNodesPanel
          api={api}
          activeView={activeView}
          activeNodeId={activeNodeId}
          homeNodeId={homeNodeId}
          collapsed={collapsed}
          refreshKey={recentNodesRefreshKey}
          pageBase={pageBase}
        />
      </nav>
    </aside>
  );
}
