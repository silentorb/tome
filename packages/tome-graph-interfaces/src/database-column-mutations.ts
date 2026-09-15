import type { TableColumnDef, TableColumnType } from "./table-schemas";

export type DatabaseColumnMutationError =
  | "database_not_found"
  | "column_not_found"
  | "column_key_taken"
  | "column_not_deletable"
  | "invalid_name"
  | "invalid_key"
  | "invalid_type"
  | "invalid_enum"
  | "invalid_relation_target";

export interface CreateDatabaseColumnInput {
  key?: string;
  name: string;
  type: TableColumnType;
  enumId?: string;
  association?: string;
  /** Required for relation columns unless host type uniquely matches one association endpoint. */
  endpoint?: 0 | 1;
  /** Active custom view id — new column is appended only to this view's properties. */
  viewId?: string;
}

export interface UpdateDatabaseColumnInput {
  name?: string;
  newKey?: string;
  type?: TableColumnType;
  enumId?: string | null;
  association?: string;
  endpoint?: 0 | 1;
}

export interface DatabaseColumnMutationResult {
  column: TableColumnDef;
  rowsMigrated: number;
  relationsUnlinked: number;
  valuesCleared: number;
}
