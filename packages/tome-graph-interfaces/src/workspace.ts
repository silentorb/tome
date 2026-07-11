export interface WorkspaceQuickLink {
  nodeId: string;
  label: string;
  icon: string;
}

/** @deprecated Use WorkspaceQuickLink */
export type SidebarLink = WorkspaceQuickLink;

export interface WorkspaceBranding {
  appTitle?: string;
  defaultDocumentIcon?: string;
  staticSiteHeader?: string;
  /** Custom static-site footer template; replaces the default copyright template when set. */
  staticSiteFooter?: string;
  /** Organization name substituted for :organization: in the footer template. */
  staticSiteFooterOrganization?: string;
}

export interface WorkspaceLegacy {
  exportPathPrefix?: string;
  archivePathPrefix?: string;
}

export interface WorkspaceGraphExplorer {
  defaultAnchorNodeId: string;
}

export interface WorkspaceStaticSite {
  homeNodeId: string;
}

export interface WorkspaceEditor {
  markdownBodyPanel?: boolean;
}

export interface WorkspaceSpatialGraphNodeDimensionScale {
  x?: number;
  y?: number;
}

export interface WorkspaceSpatialGraph {
  nodeDimensionScale?: WorkspaceSpatialGraphNodeDimensionScale;
}

export type WorkspaceSchemaDiagramMemberBadgePosition =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export interface WorkspaceSchemaDiagram {
  memberBadgePosition?: WorkspaceSchemaDiagramMemberBadgePosition;
}

export interface WorkspaceFile {
  version: number;
  homeNodeId: string;
  archiveNodeId: string;
  protectedNodeIds: string[];
  graphExplorer: WorkspaceGraphExplorer;
  staticSite: WorkspaceStaticSite;
  quickLinks: WorkspaceQuickLink[];
  branding?: WorkspaceBranding;
  legacy?: WorkspaceLegacy;
  editor?: WorkspaceEditor;
  spatialGraph?: WorkspaceSpatialGraph;
  schemaDiagram?: WorkspaceSchemaDiagram;
}

export type QuickLinkError =
  | "not_found"
  | "already_exists"
  | "not_a_quick_link"
  | "invalid_order";
