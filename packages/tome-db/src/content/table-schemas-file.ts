import { isNodeId } from "./paths";

export const TABLE_SCHEMAS_FILE_VERSION = 1;

export type TableColumnScalarType =
  | "checkbox"
  | "date"
  | "email"
  | "files"
  | "multi_select"
  | "number"
  | "phone_number"
  | "rich_text"
  | "select"
  | "status"
  | "text"
  | "url";

export type TableColumnType = TableColumnScalarType | "relation";

export interface TableScalarColumn {
  key: string;
  name: string;
  type: TableColumnScalarType;
  /** References schema.json enums by id (e.g. priority). */
  enumId?: string;
}

export interface TableRelationColumn {
  key: string;
  name: string;
  type: "relation";
  targetTypeId: string;
  /** Local perspective / relationship slug (defaults from name via relationType). */
  perspective?: string;
}

export type TableColumnDef = TableScalarColumn | TableRelationColumn;

export interface TableSchema {
  columns: TableColumnDef[];
}

export interface TableSchemasFile {
  version: number;
  tables: Record<string, TableSchema>;
}

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
  if (typeof obj.targetTypeId !== "string" || !isNodeId(obj.targetTypeId)) {
    throw new Error(`${path}: relation column requires valid targetTypeId`);
  }
  const column: TableRelationColumn = {
    key: obj.key.trim(),
    name: obj.name.trim(),
    type: "relation",
    targetTypeId: obj.targetTypeId,
  };
  if (obj.perspective !== undefined) {
    if (typeof obj.perspective !== "string" || !obj.perspective.trim()) {
      throw new Error(`${path}: column.perspective must be a non-empty string`);
    }
    column.perspective = obj.perspective.trim();
  }
  return column;
}

function parseColumn(raw: unknown, path: string): TableColumnDef {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${path}: column must be an object`);
  }
  const type = (raw as Record<string, unknown>).type;
  if (type === "relation") return parseRelationColumn(raw, path);
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
  return { columns };
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
