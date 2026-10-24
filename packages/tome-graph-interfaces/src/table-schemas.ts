/** Form-friendly scalars (typically membership-edge storage; compact Properties form). */
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

/**
 * Structured value types — data nature for rich fields.
 * Presentation (page section vs form) is inferred by clients from this type.
 */
export type TableColumnStructuredType = "imp_graph" | "json";

export type TableColumnType =
  | TableColumnScalarType
  | TableColumnStructuredType
  | "relation";

/** Where column values are stored. Default: membership-edge (`edge`). */
export type TableColumnStorage = "node" | "edge";

export interface TableScalarColumn {
  key: string;
  name: string;
  type: TableColumnScalarType;
  /** References schema.json enums by id (e.g. priority). */
  enumId?: string;
  /** Default `edge` (membership / set-carrier properties). */
  storage?: TableColumnStorage;
}

export interface TableStructuredColumn {
  key: string;
  name: string;
  type: TableColumnStructuredType;
  /** Default `edge`. Ontology intrinsics typically use `node`. */
  storage?: TableColumnStorage;
}

export interface TableRelationColumn {
  key: string;
  name: string;
  type: "relation";
  /** Registered relationship type id (storage composite). */
  association: string;
  /** Relationship type endpoint index this column hosts (`perspectives[endpoint]` is display-only). */
  endpoint: 0 | 1;
}

export type TableColumnDef =
  | TableScalarColumn
  | TableStructuredColumn
  | TableRelationColumn;

export interface TableSchema {
  columns: TableColumnDef[];
}

export interface TableSchemasFile {
  version: number;
  tables: Record<string, TableSchema>;
}
