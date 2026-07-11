export type DeleteDatabaseColumnError =
  | "database_not_found"
  | "column_not_found"
  | "column_not_deletable";

export interface DeleteDatabaseColumnResult {
  rowsAffected: number;
  relationsUnlinked: number;
}
