import { isNodeId } from "../content/paths";

export const ORDERED_ASSOCIATIONS_FILE_VERSION = 1;

export interface OrderedAssociationConfig {
  id: string;
  typeDatabaseId: string;
  membershipEdgeType: string;
  orderProperty: string;
  /** Composite relationship type for member ↔ scope tabs (e.g. scenes_product). */
  scopeCompositeType: string;
  /** Composite relationship type for member ↔ group subsection (e.g. scenes_part). */
  groupCompositeType: string;
  /** Composite relationship type linking group nodes to scope (e.g. products_parts_database). */
  partProductCompositeType: string;
  groupTypeDatabaseId: string;
  unassignedGroupTitle: string;
  /** Notion view name used internally for column visibility (no view tabs in UI). */
  columnViewName?: string;
  /** Slugified column keys excluded from table columns (UI-redundant or deprecated). */
  excludedColumnKeys?: string[];
  /** Membership property on group rows used for subsection sort order. */
  partNumberProperty?: string;
}

export interface OrderedAssociationsFile {
  version: number;
  configs: OrderedAssociationConfig[];
}

function parseNodeId(value: unknown, path: string): string {
  if (typeof value !== "string" || !isNodeId(value)) {
    throw new Error(`${path}: must be a 32-character hex node id`);
  }
  return value;
}

function parseRequiredString(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${path}: must be a non-empty string`);
  }
  return value.trim();
}

function parseStringArray(value: unknown, path: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new Error(`${path}: must be an array`);
  }
  return value.map((entry, index) => parseRequiredString(entry, `${path}[${index}]`));
}

function parseConfig(raw: unknown, path: string): OrderedAssociationConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${path}: must be an object`);
  }
  const obj = raw as Record<string, unknown>;

  const config: OrderedAssociationConfig = {
    id: parseRequiredString(obj.id, `${path}.id`),
    typeDatabaseId: parseNodeId(obj.typeDatabaseId, `${path}.typeDatabaseId`),
    membershipEdgeType: parseRequiredString(obj.membershipEdgeType, `${path}.membershipEdgeType`),
    orderProperty: parseRequiredString(obj.orderProperty, `${path}.orderProperty`),
    scopeCompositeType: parseRequiredString(obj.scopeCompositeType, `${path}.scopeCompositeType`),
    groupCompositeType: parseRequiredString(obj.groupCompositeType, `${path}.groupCompositeType`),
    partProductCompositeType: parseRequiredString(
      obj.partProductCompositeType,
      `${path}.partProductCompositeType`,
    ),
    groupTypeDatabaseId: parseNodeId(obj.groupTypeDatabaseId, `${path}.groupTypeDatabaseId`),
    unassignedGroupTitle: parseRequiredString(
      obj.unassignedGroupTitle,
      `${path}.unassignedGroupTitle`,
    ),
  };

  if (obj.columnViewName !== undefined) {
    config.columnViewName = parseRequiredString(obj.columnViewName, `${path}.columnViewName`);
  }
  const excludedColumnKeys = parseStringArray(obj.excludedColumnKeys, `${path}.excludedColumnKeys`);
  if (excludedColumnKeys) {
    config.excludedColumnKeys = excludedColumnKeys;
  }
  if (obj.partNumberProperty !== undefined) {
    config.partNumberProperty = parseRequiredString(
      obj.partNumberProperty,
      `${path}.partNumberProperty`,
    );
  }

  return config;
}

export function emptyOrderedAssociationsFile(): OrderedAssociationsFile {
  return { version: ORDERED_ASSOCIATIONS_FILE_VERSION, configs: [] };
}

export function parseOrderedAssociationsFile(raw: string): OrderedAssociationsFile {
  const data = JSON.parse(raw) as unknown;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("ordered-associations.json: root must be an object");
  }
  const obj = data as Record<string, unknown>;

  if (obj.version !== ORDERED_ASSOCIATIONS_FILE_VERSION) {
    throw new Error(`ordered-associations.json: unsupported version ${String(obj.version)}`);
  }

  if (!Array.isArray(obj.configs)) {
    throw new Error("ordered-associations.json configs: must be an array");
  }

  const configs = obj.configs.map((entry, index) =>
    parseConfig(entry, `ordered-associations.json configs[${index}]`),
  );

  const seenIds = new Set<string>();
  for (const config of configs) {
    if (seenIds.has(config.id)) {
      throw new Error(`ordered-associations.json: duplicate config id "${config.id}"`);
    }
    seenIds.add(config.id);
  }

  return { version: ORDERED_ASSOCIATIONS_FILE_VERSION, configs };
}

export function serializeOrderedAssociationsFile(file: OrderedAssociationsFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}
