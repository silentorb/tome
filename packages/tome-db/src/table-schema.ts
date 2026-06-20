import type { TableColumnDef, TableScalarColumn, TableSchema } from "./content/table-schemas-file";

/** Stored scalar column types (values live on is_a relationship properties). */
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

export function relationColumns(schema: TableSchema): TableColumnDef[] {
  return schema.columns.filter((col) => col.type === "relation");
}
