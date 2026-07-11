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
  /** Registered relationship type id (storage composite). */
  relationshipType: string;
}

export type TableColumnDef = TableScalarColumn | TableRelationColumn;

export interface TableSchema {
  columns: TableColumnDef[];
  /** Storage composite for set membership rows (default `member_of`). */
  membershipComposite?: string;
}

export interface TableSchemasFile {
  version: number;
  tables: Record<string, TableSchema>;
}
