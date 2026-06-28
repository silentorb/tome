import { isNodeId } from "../content/paths";

export const WORKSPACE_FILE_VERSION = 1;

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
}

export function editorMarkdownBodyPanel(workspace: WorkspaceFile): boolean {
  return workspace.editor?.markdownBodyPanel === true;
}

export function spatialGraphNodeDimensionScale(
  workspace: WorkspaceFile,
): WorkspaceSpatialGraphNodeDimensionScale | undefined {
  const scale = workspace.spatialGraph?.nodeDimensionScale;
  if (!scale) return undefined;
  const result: WorkspaceSpatialGraphNodeDimensionScale = {};
  if (typeof scale.x === "number") result.x = scale.x;
  if (typeof scale.y === "number") result.y = scale.y;
  return Object.keys(result).length > 0 ? result : undefined;
}

function parseNodeId(value: unknown, path: string): string {
  if (typeof value !== "string" || !isNodeId(value)) {
    throw new Error(`${path}: must be a 32-character hex node id`);
  }
  return value;
}

function parseNodeIdArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${path}: must be an array`);
  }
  return value.map((entry, index) => parseNodeId(entry, `${path}[${index}]`));
}

function parseWorkspaceQuickLink(raw: unknown, path: string): WorkspaceQuickLink {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${path}: must be an object`);
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.label !== "string" || !obj.label.trim()) {
    throw new Error(`${path}: label is required`);
  }
  if (typeof obj.icon !== "string") {
    throw new Error(`${path}: icon is required`);
  }
  return {
    nodeId: parseNodeId(obj.nodeId, `${path}.nodeId`),
    label: obj.label.trim(),
    icon: obj.icon,
  };
}

function parseBranding(raw: unknown, path: string): WorkspaceBranding | undefined {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${path}: must be an object`);
  }
  const obj = raw as Record<string, unknown>;
  const branding: WorkspaceBranding = {};
  if (obj.appTitle !== undefined) {
    if (typeof obj.appTitle !== "string") throw new Error(`${path}.appTitle: must be a string`);
    branding.appTitle = obj.appTitle;
  }
  if (obj.defaultDocumentIcon !== undefined) {
    if (typeof obj.defaultDocumentIcon !== "string") {
      throw new Error(`${path}.defaultDocumentIcon: must be a string`);
    }
    branding.defaultDocumentIcon = obj.defaultDocumentIcon;
  }
  if (obj.staticSiteHeader !== undefined) {
    if (typeof obj.staticSiteHeader !== "string") {
      throw new Error(`${path}.staticSiteHeader: must be a string`);
    }
    branding.staticSiteHeader = obj.staticSiteHeader;
  }
  if (obj.staticSiteFooter !== undefined) {
    if (typeof obj.staticSiteFooter !== "string") {
      throw new Error(`${path}.staticSiteFooter: must be a string`);
    }
    const trimmed = obj.staticSiteFooter.trim();
    if (trimmed) branding.staticSiteFooter = trimmed;
  }
  if (obj.staticSiteFooterOrganization !== undefined) {
    if (typeof obj.staticSiteFooterOrganization !== "string") {
      throw new Error(`${path}.staticSiteFooterOrganization: must be a string`);
    }
    const trimmed = obj.staticSiteFooterOrganization.trim();
    if (trimmed) branding.staticSiteFooterOrganization = trimmed;
  }
  return Object.keys(branding).length > 0 ? branding : undefined;
}

function parseLegacy(raw: unknown, path: string): WorkspaceLegacy | undefined {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${path}: must be an object`);
  }
  const obj = raw as Record<string, unknown>;
  const legacy: WorkspaceLegacy = {};
  if (obj.exportPathPrefix !== undefined) {
    if (typeof obj.exportPathPrefix !== "string") {
      throw new Error(`${path}.exportPathPrefix: must be a string`);
    }
    legacy.exportPathPrefix = obj.exportPathPrefix;
  }
  if (obj.archivePathPrefix !== undefined) {
    if (typeof obj.archivePathPrefix !== "string") {
      throw new Error(`${path}.archivePathPrefix: must be a string`);
    }
    legacy.archivePathPrefix = obj.archivePathPrefix;
  }
  return Object.keys(legacy).length > 0 ? legacy : undefined;
}

function parsePositiveScaleAxis(value: unknown, path: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${path}: must be a finite number greater than 0`);
  }
  return value;
}

function parseSpatialGraph(raw: unknown, path: string): WorkspaceSpatialGraph | undefined {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${path}: must be an object`);
  }
  const obj = raw as Record<string, unknown>;
  const spatialGraph: WorkspaceSpatialGraph = {};
  if (obj.nodeDimensionScale !== undefined) {
    if (!obj.nodeDimensionScale || typeof obj.nodeDimensionScale !== "object" || Array.isArray(obj.nodeDimensionScale)) {
      throw new Error(`${path}.nodeDimensionScale: must be an object`);
    }
    const scaleObj = obj.nodeDimensionScale as Record<string, unknown>;
    const nodeDimensionScale: WorkspaceSpatialGraphNodeDimensionScale = {};
    const x = parsePositiveScaleAxis(scaleObj.x, `${path}.nodeDimensionScale.x`);
    const y = parsePositiveScaleAxis(scaleObj.y, `${path}.nodeDimensionScale.y`);
    if (x !== undefined) nodeDimensionScale.x = x;
    if (y !== undefined) nodeDimensionScale.y = y;
    if (Object.keys(nodeDimensionScale).length > 0) {
      spatialGraph.nodeDimensionScale = nodeDimensionScale;
    }
  }
  return Object.keys(spatialGraph).length > 0 ? spatialGraph : undefined;
}

function parseEditor(raw: unknown, path: string): WorkspaceEditor | undefined {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${path}: must be an object`);
  }
  const obj = raw as Record<string, unknown>;
  const editor: WorkspaceEditor = {};
  if (obj.markdownBodyPanel !== undefined) {
    if (typeof obj.markdownBodyPanel !== "boolean") {
      throw new Error(`${path}.markdownBodyPanel: must be a boolean`);
    }
    editor.markdownBodyPanel = obj.markdownBodyPanel;
  }
  return Object.keys(editor).length > 0 ? editor : undefined;
}

export function emptyWorkspaceFile(): WorkspaceFile {
  return {
    version: WORKSPACE_FILE_VERSION,
    homeNodeId: "00000000000000000000000000000001",
    archiveNodeId: "00000000000000000000000000000002",
    protectedNodeIds: [
      "00000000000000000000000000000001",
      "00000000000000000000000000000002",
    ],
    graphExplorer: { defaultAnchorNodeId: "00000000000000000000000000000003" },
    staticSite: { homeNodeId: "00000000000000000000000000000001" },
    quickLinks: [],
  };
}

function parseQuickLinksArray(raw: unknown, path: string): WorkspaceQuickLink[] {
  if (!Array.isArray(raw)) {
    throw new Error(`${path}: must be an array`);
  }
  return raw.map((link, index) => parseWorkspaceQuickLink(link, `${path}[${index}]`));
}

function parseQuickLinks(obj: Record<string, unknown>): WorkspaceQuickLink[] {
  if (obj.quickLinks !== undefined) {
    return parseQuickLinksArray(obj.quickLinks, "workspace.json quickLinks");
  }
  const sidebar = obj.sidebar;
  if (sidebar && typeof sidebar === "object" && !Array.isArray(sidebar)) {
    const sidebarObj = sidebar as Record<string, unknown>;
    if (sidebarObj.links !== undefined) {
      return parseQuickLinksArray(sidebarObj.links, "workspace.json sidebar.links");
    }
  }
  throw new Error("workspace.json quickLinks: must be an array");
}

export function parseWorkspaceFile(raw: string): WorkspaceFile {
  const data = JSON.parse(raw) as unknown;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("workspace.json: root must be an object");
  }
  const obj = data as Record<string, unknown>;

  if (obj.version !== WORKSPACE_FILE_VERSION) {
    throw new Error(`workspace.json: unsupported version ${String(obj.version)}`);
  }

  const homeNodeId = parseNodeId(obj.homeNodeId, "workspace.json homeNodeId");
  const archiveNodeId = parseNodeId(obj.archiveNodeId, "workspace.json archiveNodeId");
  const protectedNodeIds = parseNodeIdArray(
    obj.protectedNodeIds,
    "workspace.json protectedNodeIds",
  );

  if (!obj.graphExplorer || typeof obj.graphExplorer !== "object" || Array.isArray(obj.graphExplorer)) {
    throw new Error("workspace.json graphExplorer: must be an object");
  }
  const graphExplorerObj = obj.graphExplorer as Record<string, unknown>;
  const graphExplorer: WorkspaceGraphExplorer = {
    defaultAnchorNodeId: parseNodeId(
      graphExplorerObj.defaultAnchorNodeId,
      "workspace.json graphExplorer.defaultAnchorNodeId",
    ),
  };

  if (!obj.staticSite || typeof obj.staticSite !== "object" || Array.isArray(obj.staticSite)) {
    throw new Error("workspace.json staticSite: must be an object");
  }
  const staticSiteObj = obj.staticSite as Record<string, unknown>;
  const staticSite: WorkspaceStaticSite = {
    homeNodeId: parseNodeId(staticSiteObj.homeNodeId, "workspace.json staticSite.homeNodeId"),
  };

  const quickLinks = parseQuickLinks(obj);

  const branding = parseBranding(obj.branding, "workspace.json branding");
  const legacy = parseLegacy(obj.legacy, "workspace.json legacy");
  const editor = parseEditor(obj.editor, "workspace.json editor");
  const spatialGraph = parseSpatialGraph(obj.spatialGraph, "workspace.json spatialGraph");

  return {
    version: WORKSPACE_FILE_VERSION,
    homeNodeId,
    archiveNodeId,
    protectedNodeIds,
    graphExplorer,
    staticSite,
    quickLinks,
    ...(branding ? { branding } : {}),
    ...(legacy ? { legacy } : {}),
    ...(editor ? { editor } : {}),
    ...(spatialGraph ? { spatialGraph } : {}),
  };
}

export function serializeWorkspaceFile(file: WorkspaceFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}
