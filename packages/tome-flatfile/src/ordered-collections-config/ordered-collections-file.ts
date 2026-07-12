import { isNodeId, resolveContentPath } from "../content/paths";
import { isAssociationId, normalizeAssociationId } from "../content/associations-file";
import { loadAssociationsFromContent } from "../associations/load";
import { isOrderedSetProjectionType, setRoleProjectionTypesForNode } from "../association-traits";
import type {
  OrderedCollectionConfig,
  OrderedCollectionsFile,
} from "tome-graph-interfaces";

export type {
  OrderedCollectionConfig,
  OrderedCollectionsFile,
} from "tome-graph-interfaces";

export const ORDERED_COLLECTIONS_FILE_VERSION = 1;


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

function assertOrderedSetTable(nodeId: string, path: string, contentDir?: string): void {
  const dir = contentDir ?? resolveContentPath();
  const registry = loadAssociationsFromContent(dir);
  const [setProjection] = setRoleProjectionTypesForNode(nodeId, dir);
  if (!isOrderedSetProjectionType(registry, setProjection)) {
    throw new Error(
      `${path}: table ${nodeId} must use an ordered set-trait association (views.json set association or sole ordered set association)`,
    );
  }
}

function parseAssociationId(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${path}: must be a non-empty string`);
  }
  const id = normalizeAssociationId(value);
  if (!isAssociationId(id)) {
    throw new Error(`${path}: must be an association id (ULID)`);
  }
  return id;
}

function parseConfig(raw: unknown, path: string, contentDir?: string): OrderedCollectionConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${path}: must be an object`);
  }
  const obj = raw as Record<string, unknown>;

  const typeDatabaseId = parseNodeId(obj.typeDatabaseId, `${path}.typeDatabaseId`);
  const groupTypeDatabaseId = parseNodeId(obj.groupTypeDatabaseId, `${path}.groupTypeDatabaseId`);
  assertOrderedSetTable(typeDatabaseId, `${path}.typeDatabaseId`, contentDir);
  assertOrderedSetTable(groupTypeDatabaseId, `${path}.groupTypeDatabaseId`, contentDir);

  const config: OrderedCollectionConfig = {
    id: parseRequiredString(obj.id, `${path}.id`),
    typeDatabaseId,
    scopeCompositeType: parseAssociationId(obj.scopeCompositeType, `${path}.scopeCompositeType`),
    groupCompositeType: parseAssociationId(obj.groupCompositeType, `${path}.groupCompositeType`),
    partProductCompositeType: parseAssociationId(
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

export function emptyOrderedCollectionsFile(): OrderedCollectionsFile {
  return { version: ORDERED_COLLECTIONS_FILE_VERSION, configs: [] };
}

export function parseOrderedCollectionsFile(
  raw: string,
  contentDir?: string,
): OrderedCollectionsFile {
  const data = JSON.parse(raw) as unknown;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("ordered-collections.json: root must be an object");
  }
  const obj = data as Record<string, unknown>;

  if (obj.version !== ORDERED_COLLECTIONS_FILE_VERSION) {
    throw new Error(`ordered-collections.json: unsupported version ${String(obj.version)}`);
  }

  if (!Array.isArray(obj.configs)) {
    throw new Error("ordered-collections.json configs: must be an array");
  }

  const configs = obj.configs.map((entry, index) =>
    parseConfig(entry, `ordered-collections.json configs[${index}]`, contentDir),
  );

  const seenIds = new Set<string>();
  for (const config of configs) {
    if (seenIds.has(config.id)) {
      throw new Error(`ordered-collections.json: duplicate config id "${config.id}"`);
    }
    seenIds.add(config.id);
  }

  return { version: ORDERED_COLLECTIONS_FILE_VERSION, configs };
}

export function serializeOrderedCollectionsFile(file: OrderedCollectionsFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}
