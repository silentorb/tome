import type {
  TableColumnDef,
  TableColumnStorage,
  TableScalarColumn,
  TableSchema,
  TableStructuredColumn,
} from "./content/table-schemas-file";

/** Form-friendly scalar column types (compact Properties / Items cells). */
export const STORED_SCALAR_COLUMN_TYPES = new Set([
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

/** Structured column types — page presentation typically promotes these to sections. */
export const STRUCTURED_COLUMN_TYPES = new Set(["imp_graph", "json"]);

export function slugifyPropertyKey(label: string): string {
  let s = label.trim().toLowerCase();
  s = s.replace(/[^a-z0-9_]+/g, "_");
  s = s.replace(/^_+|_+$/g, "").replace(/__+/g, "_");
  if (!s) s = "property";
  if (/^\d/.test(s)) s = `prop_${s}`;
  return s;
}

export function isStoredScalarColumnType(type: string): boolean {
  return STORED_SCALAR_COLUMN_TYPES.has(type);
}

export function isStructuredColumnType(type: string): boolean {
  return STRUCTURED_COLUMN_TYPES.has(type);
}

export function columnStorage(col: {
  storage?: TableColumnStorage;
}): TableColumnStorage {
  return col.storage ?? "edge";
}

export function getTableSchema(
  file: { tables: Record<string, TableSchema> },
  typeNodeId: string,
): TableSchema | null {
  return file.tables[typeNodeId] ?? null;
}

export function findColumnByKey(schema: TableSchema, columnKey: string): TableColumnDef | null {
  const normalized = columnKey.trim();
  return schema.columns.find((col) => col.key === normalized) ?? null;
}

export function storedScalarColumns(schema: TableSchema): TableScalarColumn[] {
  return schema.columns.filter(
    (col): col is TableScalarColumn =>
      col.type !== "relation" && isStoredScalarColumnType(col.type),
  );
}

export function structuredColumns(schema: TableSchema): TableStructuredColumn[] {
  return schema.columns.filter(
    (col): col is TableStructuredColumn => isStructuredColumnType(col.type),
  );
}

export function relationColumns(schema: TableSchema): TableColumnDef[] {
  return schema.columns.filter((col) => col.type === "relation");
}
