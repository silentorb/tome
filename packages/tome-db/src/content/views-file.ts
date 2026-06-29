import { isNodeId } from "./paths";

export const VIEWS_FILE_VERSION = 2;

export type ViewSortDirection = "asc" | "desc";

export interface ViewSortSpec {
  column: string;
  direction: ViewSortDirection;
}

export interface ViewProperties {
  columnOrder?: string[];
}

/** A static view definition for a node + relationship type pair. */
export interface ViewDefinition {
  id: string;
  nodeId: string;
  relationshipType: string;
  name: string;
  sorts: ViewSortSpec[];
  properties?: ViewProperties;
}

/** Generated views computed at runtime from a provider (e.g. scenes-by-book). */
export interface GeneratedViewRecord {
  nodeId: string;
  relationshipType: string;
  generator: string;
}

export type ViewRecord = ViewDefinition | GeneratedViewRecord;

/** @deprecated Use ViewDefinition */
export type CustomTabDefinition = Pick<ViewDefinition, "id" | "name" | "sorts">;

export interface ViewsFile {
  version: number;
  views: ViewRecord[];
}

export function isGeneratedViewRecord(record: ViewRecord): record is GeneratedViewRecord {
  return "generator" in record && typeof (record as GeneratedViewRecord).generator === "string";
}

export function isViewDefinition(record: ViewRecord): record is ViewDefinition {
  return "id" in record && "name" in record && "sorts" in record;
}

export function emptyViewsFile(): ViewsFile {
  return { version: VIEWS_FILE_VERSION, views: [] };
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

function parseViewProperties(raw: unknown, path: string): ViewProperties | undefined {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${path}: properties must be an object`);
  }
  const obj = raw as Record<string, unknown>;
  const columnOrder = parseColumnOrder(obj.columnOrder, `${path}.columnOrder`);
  if (!columnOrder) return undefined;
  return { columnOrder };
}

function parseViewDefinition(raw: unknown, index: number): ViewDefinition {
  const path = `views.json views[${index}]`;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${path}: must be an object`);
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.generator === "string") {
    throw new Error(`${path}: custom views must not include generator`);
  }
  if (typeof obj.id !== "string" || !obj.id.trim()) {
    throw new Error(`${path}: id is required`);
  }
  if (typeof obj.nodeId !== "string" || !isNodeId(obj.nodeId)) {
    throw new Error(`${path}: nodeId must be a 32-character hex node id`);
  }
  if (typeof obj.relationshipType !== "string" || !obj.relationshipType.trim()) {
    throw new Error(`${path}: relationshipType is required`);
  }
  if (typeof obj.name !== "string" || !obj.name.trim()) {
    throw new Error(`${path}: name is required`);
  }
  if (!Array.isArray(obj.sorts)) {
    throw new Error(`${path}: sorts must be an array`);
  }
  const properties = parseViewProperties(obj.properties, `${path}.properties`);
  return {
    id: obj.id.trim(),
    nodeId: obj.nodeId.trim().toLowerCase(),
    relationshipType: obj.relationshipType.trim(),
    name: obj.name.trim(),
    sorts: obj.sorts.map((sort, sortIndex) =>
      parseSortSpec(sort, `${path}.sorts[${sortIndex}]`),
    ),
    ...(properties ? { properties } : {}),
  };
}

function parseGeneratedViewRecord(raw: unknown, index: number): GeneratedViewRecord {
  const path = `views.json views[${index}]`;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${path}: must be an object`);
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.nodeId !== "string" || !isNodeId(obj.nodeId)) {
    throw new Error(`${path}: nodeId must be a 32-character hex node id`);
  }
  if (typeof obj.relationshipType !== "string" || !obj.relationshipType.trim()) {
    throw new Error(`${path}: relationshipType is required`);
  }
  if (typeof obj.generator !== "string" || !obj.generator.trim()) {
    throw new Error(`${path}: generator is required`);
  }
  if ("id" in obj || "name" in obj || "sorts" in obj) {
    throw new Error(`${path}: generated views must not include id, name, or sorts`);
  }
  return {
    nodeId: obj.nodeId.trim().toLowerCase(),
    relationshipType: obj.relationshipType.trim(),
    generator: obj.generator.trim(),
  };
}

function parseViewRecord(raw: unknown, index: number): ViewRecord {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`views.json views[${index}]: must be an object`);
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.generator === "string" && obj.generator.trim()) {
    return parseGeneratedViewRecord(raw, index);
  }
  return parseViewDefinition(raw, index);
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
  if (obj.version !== VIEWS_FILE_VERSION) {
    throw new Error(`views.json: unsupported version ${obj.version} (expected ${VIEWS_FILE_VERSION})`);
  }
  if (!Array.isArray(obj.views)) {
    throw new Error("views.json: views must be an array");
  }

  const views: ViewRecord[] = [];
  const customViewIds = new Set<string>();
  const generatedPairs = new Set<string>();
  const customPairs = new Set<string>();

  for (let index = 0; index < obj.views.length; index += 1) {
    const record = parseViewRecord(obj.views[index], index);
    views.push(record);

    const pairKey = `${record.nodeId}:${record.relationshipType}`;
    if (isGeneratedViewRecord(record)) {
      if (customPairs.has(pairKey)) {
        throw new Error(
          `views.json views[${index}]: cannot mix generated and custom views for ${record.nodeId}/${record.relationshipType}`,
        );
      }
      if (generatedPairs.has(pairKey)) {
        throw new Error(
          `views.json views[${index}]: duplicate generated view for ${record.nodeId}/${record.relationshipType}`,
        );
      }
      generatedPairs.add(pairKey);
      continue;
    }

    if (generatedPairs.has(pairKey)) {
      throw new Error(
        `views.json views[${index}]: cannot mix generated and custom views for ${record.nodeId}/${record.relationshipType}`,
      );
    }
    const viewKey = `${pairKey}:${record.id}`;
    if (customViewIds.has(viewKey)) {
      throw new Error(`views.json views[${index}]: duplicate view id "${record.id}"`);
    }
    customViewIds.add(viewKey);
    customPairs.add(pairKey);
  }

  return { version: obj.version, views };
}

export function serializeViewsFile(file: ViewsFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

/** Stable slug for a new view id from a display name. */
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

export const DEFAULT_VIEW: ViewDefinition = {
  id: "all",
  nodeId: "",
  relationshipType: "members",
  name: "All",
  sorts: [{ column: "name", direction: "asc" }],
};

/** @deprecated Use DEFAULT_VIEW */
export const DEFAULT_CUSTOM_TAB: CustomTabDefinition = {
  id: DEFAULT_VIEW.id,
  name: DEFAULT_VIEW.name,
  sorts: DEFAULT_VIEW.sorts,
};
