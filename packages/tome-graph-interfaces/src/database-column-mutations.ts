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
  relationshipType?: string;
}

export interface UpdateDatabaseColumnInput {
  name?: string;
  newKey?: string;
  type?: TableColumnType;
  enumId?: string | null;
  relationshipType?: string;
}

export interface DatabaseColumnMutationResult {
  column: TableColumnDef;
  rowsMigrated: number;
  relationsUnlinked: number;
  valuesCleared: number;
}
