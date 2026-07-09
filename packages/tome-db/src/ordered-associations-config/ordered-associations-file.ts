import { isNodeId, resolveContentPath } from "../content/paths";
import { ORDERED_MEMBER_OF_TYPE } from "../labels";
import { getTableSchema } from "../table-schema";
import { loadTableSchemasFromContent } from "../table-schemas/load";

export const ORDERED_ASSOCIATIONS_FILE_VERSION = 1;

export interface OrderedAssociationConfig {
  id: string;
  typeDatabaseId: string;
  /** Composite relationship type for member ↔ scope tabs (e.g. scenes_product). */
  scopeCompositeType: string;
  /** Composite relationship type for member ↔ group subsection (e.g. scenes_part). */
  groupCompositeType: string;
  /** Composite relationship type linking group nodes to scope (e.g. products_parts_database). */
  partProductCompositeType: string;
  groupTypeDatabaseId: string;
  unassignedGroupTitle: string;
  /** Reference view name used internally for column visibility (no view tabs in UI). */
  columnViewName?: string;
  /** Slugified column keys excluded from table columns (UI-redundant or deprecated). */
  excludedColumnKeys?: string[];
}

export interface OrderedAssociationsFile {
  version: number;
  configs: OrderedAssociationConfig[];
}

function parseNodeId(value: unknown, path: string): string {
  if (typeof value !== "string" || !isNodeId(value)) {
    throw new Error(`${path}: must be a node id (ULID)`);
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

function assertOrderedMembershipTable(nodeId: string, path: string, contentDir?: string): void {
  const dir = contentDir ?? resolveContentPath();
  const schema = getTableSchema(loadTableSchemasFromContent(dir), nodeId);
  if (schema?.membershipComposite !== ORDERED_MEMBER_OF_TYPE) {
    throw new Error(
      `${path}: table must declare membershipComposite "${ORDERED_MEMBER_OF_TYPE}" in table-schemas.json`,
    );
  }
}

function parseConfig(raw: unknown, path: string, contentDir?: string): OrderedAssociationConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${path}: must be an object`);
  }
  const obj = raw as Record<string, unknown>;

  const typeDatabaseId = parseNodeId(obj.typeDatabaseId, `${path}.typeDatabaseId`);
  const groupTypeDatabaseId = parseNodeId(obj.groupTypeDatabaseId, `${path}.groupTypeDatabaseId`);
  assertOrderedMembershipTable(typeDatabaseId, `${path}.typeDatabaseId`, contentDir);
  assertOrderedMembershipTable(groupTypeDatabaseId, `${path}.groupTypeDatabaseId`, contentDir);

  const config: OrderedAssociationConfig = {
    id: parseRequiredString(obj.id, `${path}.id`),
    typeDatabaseId,
    scopeCompositeType: parseRequiredString(obj.scopeCompositeType, `${path}.scopeCompositeType`),
    groupCompositeType: parseRequiredString(obj.groupCompositeType, `${path}.groupCompositeType`),
    partProductCompositeType: parseRequiredString(
      obj.partProductCompositeType,
      `${path}.partProductCompositeType`,
    ),
    groupTypeDatabaseId,
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

  return config;
}

export function emptyOrderedAssociationsFile(): OrderedAssociationsFile {
  return { version: ORDERED_ASSOCIATIONS_FILE_VERSION, configs: [] };
}

export function parseOrderedAssociationsFile(
  raw: string,
  contentDir?: string,
): OrderedAssociationsFile {
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
    parseConfig(entry, `ordered-associations.json configs[${index}]`, contentDir),
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
