import type { AppView } from "../../shared/types";
import { HOME_ICON, VIEW_ICONS } from "../quick-links-nav";

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

export interface PrimarySidePanelProps {
  activeView: AppView;
  activeNodeId?: string | null;
  homeNodeId?: string | null;
  homeHref?: string;
  corpusReadonly?: boolean;
  standaloneUrls?: SidePanelStandaloneUrls;
  onViewChange: (view: AppView) => void;
  onNewPage: () => void;
  onOpenSearch: () => void;
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

/** Fixed core chrome of the editor sidebar (Primary panel). */
export function PrimarySidePanel({
  activeView,
  activeNodeId,
  homeNodeId,
  homeHref,
  corpusReadonly = false,
  standaloneUrls,
  onViewChange,
  onNewPage,
  onOpenSearch,
}: PrimarySidePanelProps) {
  return (
    <div className="tome-side-panel-primary" aria-label="Primary">
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
    </div>
  );
}
