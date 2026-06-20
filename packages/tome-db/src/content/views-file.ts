import { isNodeId } from "./paths";

export const VIEWS_FILE_VERSION = 1;

export type ViewSortDirection = "asc" | "desc";

export interface ViewSortSpec {
  column: string;
  direction: ViewSortDirection;
}

export interface CustomTabDefinition {
  id: string;
  name: string;
  sorts: ViewSortSpec[];
}

export interface CustomSectionTabs {
  kind: "custom";
  definitions: CustomTabDefinition[];
}

export interface GeneratedSectionTabs {
  kind: "generated";
  provider: string;
}

export type SectionTabsConfig = CustomSectionTabs | GeneratedSectionTabs;

export interface NodeSectionViewConfig {
  tabs: SectionTabsConfig;
  /** Optional override for data column order (column keys, not display names). */
  columnOrder?: string[];
}

export interface NodeViewConfig {
  sections: Record<string, NodeSectionViewConfig>;
}

export interface ViewsFile {
  version: number;
  nodes: Record<string, NodeViewConfig>;
}

export function emptyViewsFile(): ViewsFile {
  return { version: VIEWS_FILE_VERSION, nodes: {} };
}

function parseSortSpec(raw: unknown, path: string): ViewSortSpec {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${path}: sort must be an object`);
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.column !== "string" || !obj.column.trim()) {
    throw new Error(`${path}: sort.column is required`);
  }
  if (obj.direction !== "asc" && obj.direction !== "desc") {
    throw new Error(`${path}: sort.direction must be "asc" or "desc"`);
  }
  return { column: obj.column.trim(), direction: obj.direction };
}

function parseCustomTab(raw: unknown, path: string): CustomTabDefinition {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${path}: tab definition must be an object`);
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.id !== "string" || !obj.id.trim()) {
    throw new Error(`${path}: tab id is required`);
  }
  if (typeof obj.name !== "string" || !obj.name.trim()) {
    throw new Error(`${path}: tab name is required`);
  }
  if (!Array.isArray(obj.sorts)) {
    throw new Error(`${path}: tab sorts must be an array`);
  }
  return {
    id: obj.id.trim(),
    name: obj.name.trim(),
    sorts: obj.sorts.map((sort, index) => parseSortSpec(sort, `${path}.sorts[${index}]`)),
  };
}

function parseSectionTabs(raw: unknown, path: string): SectionTabsConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${path}: tabs must be an object`);
  }
  const obj = raw as Record<string, unknown>;
  if (obj.kind === "generated") {
    if (typeof obj.provider !== "string" || !obj.provider.trim()) {
      throw new Error(`${path}: generated tabs require provider`);
    }
    return { kind: "generated", provider: obj.provider.trim() };
  }
  if (obj.kind === "custom") {
    if (!Array.isArray(obj.definitions)) {
      throw new Error(`${path}: custom tabs require definitions array`);
    }
    const definitions = obj.definitions.map((def, index) =>
      parseCustomTab(def, `${path}.definitions[${index}]`),
    );
    if (definitions.length === 0) {
      throw new Error(`${path}: custom tabs require at least one definition`);
    }
    const ids = new Set<string>();
    for (const def of definitions) {
      if (ids.has(def.id)) {
        throw new Error(`${path}: duplicate tab id "${def.id}"`);
      }
      ids.add(def.id);
    }
    return { kind: "custom", definitions };
  }
  throw new Error(`${path}: tabs.kind must be "custom" or "generated"`);
}

function parseColumnOrder(raw: unknown, path: string): string[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) {
    throw new Error(`${path}: columnOrder must be an array`);
  }
  const order: string[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const entry = raw[index];
    if (typeof entry !== "string" || !entry.trim()) {
      throw new Error(`${path}.columnOrder[${index}]: must be a non-empty string`);
    }
    order.push(entry.trim());
  }
  return order.length > 0 ? order : undefined;
}

function parseNodeViewConfig(raw: unknown, nodeId: string): NodeViewConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`views.json nodes.${nodeId}: must be an object`);
  }
  const obj = raw as Record<string, unknown>;
  if (!obj.sections || typeof obj.sections !== "object" || Array.isArray(obj.sections)) {
    throw new Error(`views.json nodes.${nodeId}: sections must be an object`);
  }
  const sections: Record<string, NodeSectionViewConfig> = {};
  for (const [sectionKey, sectionRaw] of Object.entries(obj.sections)) {
    if (!sectionRaw || typeof sectionRaw !== "object" || Array.isArray(sectionRaw)) {
      throw new Error(`views.json nodes.${nodeId}.sections.${sectionKey}: must be an object`);
    }
    const sectionObj = sectionRaw as Record<string, unknown>;
    const sectionPath = `views.json nodes.${nodeId}.sections.${sectionKey}`;
    const columnOrder = parseColumnOrder(sectionObj.columnOrder, sectionPath);
    sections[sectionKey] = {
      tabs: parseSectionTabs(sectionObj.tabs, `${sectionPath}.tabs`),
      ...(columnOrder ? { columnOrder } : {}),
    };
  }
  return { sections };
}

export function parseViewsFile(raw: string): ViewsFile {
  const data = JSON.parse(raw) as unknown;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("views.json: root must be an object");
  }
  const obj = data as Record<string, unknown>;
  if (typeof obj.version !== "number") {
    throw new Error("views.json: version is required");
  }
  if (!obj.nodes || typeof obj.nodes !== "object" || Array.isArray(obj.nodes)) {
    throw new Error("views.json: nodes must be an object");
  }
  const nodes: Record<string, NodeViewConfig> = {};
  for (const [nodeId, nodeRaw] of Object.entries(obj.nodes)) {
    if (!isNodeId(nodeId)) {
      throw new Error(`views.json nodes: invalid node id "${nodeId}"`);
    }
    nodes[nodeId] = parseNodeViewConfig(nodeRaw, nodeId);
  }
  return { version: obj.version, nodes };
}

export function serializeViewsFile(file: ViewsFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

/** Stable slug for a new tab id from a display name. */
export function slugifyTabId(name: string): string {
  let s = name.trim().toLowerCase();
  s = s.replace(/[^a-z0-9]+/g, "-");
  s = s.replace(/^-+|-+$/g, "");
  if (!s) s = "tab";
  return s;
}

export function uniqueTabId(base: string, existingIds: Set<string>): string {
  if (!existingIds.has(base)) return base;
  let index = 2;
  while (existingIds.has(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

export const DEFAULT_CUSTOM_TAB: CustomTabDefinition = {
  id: "all",
  name: "All",
  sorts: [{ column: "name", direction: "asc" }],
};
