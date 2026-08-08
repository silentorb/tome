import { isNodeId } from "../content/paths";
import { isAssociationId, normalizeAssociationId } from "../content/associations-file";
import type {
  RelationGroupsLayerConfig,
  RelationScopeLayerConfig,
  ReorderLayerConfig,
  TablePresentationComposition,
  TablePresentationFile,
} from "tome-graph-interfaces";

export type {
  RelationGroupsLayerConfig,
  RelationScopeLayerConfig,
  ReorderLayerConfig,
  TablePresentationComposition,
  TablePresentationFile,
} from "tome-graph-interfaces";

export const TABLE_PRESENTATION_FILE_VERSION = 1;

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

function parseScopeLayer(raw: unknown, path: string): RelationScopeLayerConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${path}: must be an object`);
  }
  const obj = raw as Record<string, unknown>;
  const layer: RelationScopeLayerConfig = {
    memberToScopeComposite: parseAssociationId(
      obj.memberToScopeComposite,
      `${path}.memberToScopeComposite`,
    ),
  };
  const excludeColumnKeys = parseStringArray(obj.excludeColumnKeys, `${path}.excludeColumnKeys`);
  if (excludeColumnKeys) layer.excludeColumnKeys = excludeColumnKeys;
  return layer;
}

function parseGroupsLayer(raw: unknown, path: string): RelationGroupsLayerConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${path}: must be an object`);
  }
  const obj = raw as Record<string, unknown>;
  const layer: RelationGroupsLayerConfig = {
    memberToGroupComposite: parseAssociationId(
      obj.memberToGroupComposite,
      `${path}.memberToGroupComposite`,
    ),
    groupTypeDatabaseId: parseNodeId(obj.groupTypeDatabaseId, `${path}.groupTypeDatabaseId`),
    unassignedGroupTitle: parseRequiredString(
      obj.unassignedGroupTitle,
      `${path}.unassignedGroupTitle`,
    ),
  };
  if (obj.groupToScopeComposite !== undefined) {
    layer.groupToScopeComposite = parseAssociationId(
      obj.groupToScopeComposite,
      `${path}.groupToScopeComposite`,
    );
  }
  if (obj.canonicalGroupByTitle !== undefined) {
    if (typeof obj.canonicalGroupByTitle !== "boolean") {
      throw new Error(`${path}.canonicalGroupByTitle: must be a boolean`);
    }
    layer.canonicalGroupByTitle = obj.canonicalGroupByTitle;
  }
  const excludeColumnKeys = parseStringArray(obj.excludeColumnKeys, `${path}.excludeColumnKeys`);
  if (excludeColumnKeys) layer.excludeColumnKeys = excludeColumnKeys;
  return layer;
}

function parseReorderLayer(raw: unknown, path: string): ReorderLayerConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${path}: must be an object`);
  }
  const obj = raw as Record<string, unknown>;
  const layer: ReorderLayerConfig = {};
  const excludeColumnKeys = parseStringArray(obj.excludeColumnKeys, `${path}.excludeColumnKeys`);
  if (excludeColumnKeys) layer.excludeColumnKeys = excludeColumnKeys;
  return layer;
}

function parseComposition(raw: unknown, path: string): TablePresentationComposition {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${path}: must be an object`);
  }
  const obj = raw as Record<string, unknown>;
  const composition: TablePresentationComposition = {
    id: parseRequiredString(obj.id, `${path}.id`),
    typeDatabaseId: parseNodeId(obj.typeDatabaseId, `${path}.typeDatabaseId`),
  };
  if (obj.scope !== undefined) {
    composition.scope = parseScopeLayer(obj.scope, `${path}.scope`);
  }
  if (obj.groups !== undefined) {
    composition.groups = parseGroupsLayer(obj.groups, `${path}.groups`);
  }
  if (obj.reorder !== undefined) {
    composition.reorder = parseReorderLayer(obj.reorder, `${path}.reorder`);
  }
  if (obj.columnViewName !== undefined) {
    composition.columnViewName = parseRequiredString(obj.columnViewName, `${path}.columnViewName`);
  }
  const excludeColumnKeys = parseStringArray(obj.excludeColumnKeys, `${path}.excludeColumnKeys`);
  if (excludeColumnKeys) composition.excludeColumnKeys = excludeColumnKeys;
  return composition;
}

export function emptyTablePresentationFile(): TablePresentationFile {
  return { version: TABLE_PRESENTATION_FILE_VERSION, compositions: [] };
}

export function parseTablePresentationFile(raw: string): TablePresentationFile {
  const data = JSON.parse(raw) as unknown;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("table-presentation.json: root must be an object");
  }
  const obj = data as Record<string, unknown>;

  if (obj.version !== TABLE_PRESENTATION_FILE_VERSION) {
    throw new Error(`table-presentation.json: unsupported version ${String(obj.version)}`);
  }

  if (!Array.isArray(obj.compositions)) {
    throw new Error("table-presentation.json compositions: must be an array");
  }

  const compositions = obj.compositions.map((entry, index) =>
    parseComposition(entry, `table-presentation.json compositions[${index}]`),
  );

  const seenIds = new Set<string>();
  for (const composition of compositions) {
    if (seenIds.has(composition.id)) {
      throw new Error(`table-presentation.json: duplicate composition id "${composition.id}"`);
    }
    seenIds.add(composition.id);
  }

  return { version: TABLE_PRESENTATION_FILE_VERSION, compositions };
}

export function serializeTablePresentationFile(file: TablePresentationFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}
