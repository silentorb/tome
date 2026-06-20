import { isNodeId } from "../content/paths";

export const WORKSPACE_FILE_VERSION = 1;

export interface SidebarLink {
  nodeId: string;
  label: string;
  icon: string;
}

export interface WorkspaceBranding {
  appTitle?: string;
  defaultDocumentIcon?: string;
  staticSiteHeader?: string;
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

export interface WorkspaceSidebar {
  links: SidebarLink[];
}

export interface WorkspaceFile {
  version: number;
  homeNodeId: string;
  archiveNodeId: string;
  protectedNodeIds: string[];
  graphExplorer: WorkspaceGraphExplorer;
  staticSite: WorkspaceStaticSite;
  sidebar: WorkspaceSidebar;
  branding?: WorkspaceBranding;
  legacy?: WorkspaceLegacy;
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

function parseSidebarLink(raw: unknown, path: string): SidebarLink {
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
    sidebar: { links: [] },
  };
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

  if (!obj.sidebar || typeof obj.sidebar !== "object" || Array.isArray(obj.sidebar)) {
    throw new Error("workspace.json sidebar: must be an object");
  }
  const sidebarObj = obj.sidebar as Record<string, unknown>;
  if (!Array.isArray(sidebarObj.links)) {
    throw new Error("workspace.json sidebar.links: must be an array");
  }
  const sidebar: WorkspaceSidebar = {
    links: sidebarObj.links.map((link, index) =>
      parseSidebarLink(link, `workspace.json sidebar.links[${index}]`),
    ),
  };

  const branding = parseBranding(obj.branding, "workspace.json branding");
  const legacy = parseLegacy(obj.legacy, "workspace.json legacy");

  return {
    version: WORKSPACE_FILE_VERSION,
    homeNodeId,
    archiveNodeId,
    protectedNodeIds,
    graphExplorer,
    staticSite,
    sidebar,
    ...(branding ? { branding } : {}),
    ...(legacy ? { legacy } : {}),
  };
}

export function serializeWorkspaceFile(file: WorkspaceFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}
