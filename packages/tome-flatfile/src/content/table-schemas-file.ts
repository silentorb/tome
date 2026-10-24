import { isNodeId } from "./paths";
import { isRelationshipTypeId, normalizeRelationshipTypeId } from "./relationship-types-file";
import type {
  TableColumnDef,
  TableColumnScalarType,
  TableColumnStorage,
  TableColumnStructuredType,
  TableColumnType,
  TableRelationColumn,
  TableScalarColumn,
  TableSchema,
  TableSchemasFile,
  TableStructuredColumn,
} from "tome-graph-interfaces";

export type {
  TableColumnDef,
  TableColumnScalarType,
  TableColumnStorage,
  TableColumnStructuredType,
  TableColumnType,
  TableRelationColumn,
  TableScalarColumn,
  TableSchema,
  TableSchemasFile,
  TableStructuredColumn,
} from "tome-graph-interfaces";

export const TABLE_SCHEMAS_FILE_VERSION = 1;

const SCALAR_TYPES = new Set<string>([
  "checkbox",
  "date",
  "email",
  "files",
  "multi_select",
  "number",
  "phone_number",
  "rich_text",
  "select",
  "status",
  "text",
  "url",
]);

const STRUCTURED_TYPES = new Set<string>(["imp_graph", "json"]);

function parseStorage(raw: unknown, path: string): TableColumnStorage | undefined {
  if (raw === undefined) return undefined;
  if (raw !== "node" && raw !== "edge") {
    throw new Error(`${path}: column.storage must be "node" or "edge"`);
  }
  return raw;
}

function parseScalarColumn(raw: unknown, path: string): TableScalarColumn {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${path}: column must be an object`);
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.key !== "string" || !obj.key.trim()) {
    throw new Error(`${path}: column.key is required`);
  }
  if (typeof obj.name !== "string" || !obj.name.trim()) {
    throw new Error(`${path}: column.name is required`);
  }
  if (typeof obj.type !== "string" || !SCALAR_TYPES.has(obj.type)) {
    throw new Error(`${path}: column.type must be a stored scalar type`);
  }
  const column: TableScalarColumn = {
    key: obj.key.trim(),
    name: obj.name.trim(),
    type: obj.type as TableColumnScalarType,
  };
  if (obj.enumId !== undefined) {
    if (typeof obj.enumId !== "string" || !obj.enumId.trim()) {
      throw new Error(`${path}: column.enumId must be a non-empty string`);
    }
    column.enumId = obj.enumId.trim();
  }
  const storage = parseStorage(obj.storage, path);
  if (storage) column.storage = storage;
  return column;
}

function parseStructuredColumn(raw: unknown, path: string): TableStructuredColumn {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${path}: column must be an object`);
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.key !== "string" || !obj.key.trim()) {
    throw new Error(`${path}: column.key is required`);
  }
  if (typeof obj.name !== "string" || !obj.name.trim()) {
    throw new Error(`${path}: column.name is required`);
  }
  if (typeof obj.type !== "string" || !STRUCTURED_TYPES.has(obj.type)) {
    throw new Error(`${path}: column.type must be a structured type (imp_graph | json)`);
  }
  const column: TableStructuredColumn = {
    key: obj.key.trim(),
    name: obj.name.trim(),
    type: obj.type as TableColumnStructuredType,
  };
  const storage = parseStorage(obj.storage, path);
  if (storage) column.storage = storage;
  return column;
}

function parseRelationColumn(raw: unknown, path: string): TableRelationColumn {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${path}: column must be an object`);
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.key !== "string" || !obj.key.trim()) {
    throw new Error(`${path}: column.key is required`);
  }
  if (typeof obj.name !== "string" || !obj.name.trim()) {
    throw new Error(`${path}: column.name is required`);
  }
  if (obj.type !== "relation") {
    throw new Error(`${path}: relation column must have type "relation"`);
  }
  if (typeof obj.association !== "string" || !obj.association.trim()) {
    throw new Error(`${path}: relation column requires non-empty association`);
  }
  const association = normalizeRelationshipTypeId(obj.association);
  if (!isRelationshipTypeId(association)) {
    throw new Error(`${path}: association must be a ULID`);
  }
  if (obj.endpoint !== 0 && obj.endpoint !== 1) {
    throw new Error(`${path}: relation column requires endpoint 0 or 1`);
  }
  return {
    key: obj.key.trim(),
    name: obj.name.trim(),
    type: "relation",
    association,
    endpoint: obj.endpoint,
  };
}

function parseColumn(raw: unknown, path: string): TableColumnDef {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${path}: column must be an object`);
  }
  const type = (raw as Record<string, unknown>).type;
  if (type === "relation") return parseRelationColumn(raw, path);
  if (typeof type === "string" && STRUCTURED_TYPES.has(type)) {
    return parseStructuredColumn(raw, path);
  }
  return parseScalarColumn(raw, path);
}

function parseTableSchema(raw: unknown, tableId: string): TableSchema {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`table-schemas.json tables.${tableId}: must be an object`);
  }
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.columns)) {
    throw new Error(`table-schemas.json tables.${tableId}: columns must be an array`);
  }
  const columns = obj.columns.map((col, index) =>
    parseColumn(col, `table-schemas.json tables.${tableId}.columns[${index}]`),
  );
  const keys = new Set<string>();
  for (const col of columns) {
    if (keys.has(col.key)) {
      throw new Error(`table-schemas.json tables.${tableId}: duplicate column key "${col.key}"`);
    }
    keys.add(col.key);
  }
  const schema: TableSchema = { columns };
  return schema;
}

export function emptyTableSchemasFile(): TableSchemasFile {
  return { version: TABLE_SCHEMAS_FILE_VERSION, tables: {} };
}

export function parseTableSchemasFile(raw: string): TableSchemasFile {
  const data = JSON.parse(raw) as unknown;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("table-schemas.json: root must be an object");
  }
  const obj = data as Record<string, unknown>;
  if (typeof obj.version !== "number") {
    throw new Error("table-schemas.json: version is required");
  }
  if (!obj.tables || typeof obj.tables !== "object" || Array.isArray(obj.tables)) {
    throw new Error("table-schemas.json: tables must be an object");
  }
  const tables: Record<string, TableSchema> = {};
  for (const [tableId, tableRaw] of Object.entries(obj.tables)) {
    if (!isNodeId(tableId)) {
      throw new Error(`table-schemas.json tables: invalid node id "${tableId}"`);
    }
    tables[tableId] = parseTableSchema(tableRaw, tableId);
  }
  return { version: obj.version, tables };
}

export function serializeTableSchemasFile(file: TableSchemasFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}
