import { loadDynamicFields } from "./dynamic-fields";
import {
  ROW_META_KEYS,
  stripScalarFromMembershipEdges,
  unlinkRelationColumnFromAllRows,
} from "./database-column-data";
import { isTypeTableNode } from "./node-capabilities";
import type { TomeWriteContext } from "./content/write-context";
import { syncAfterRelationshipsWrite } from "./content/write-context";
import { TABLE_SCHEMAS_FILENAME } from "./content/paths";
import type { TableSchemasFile } from "./content/table-schemas-file";
import { findColumnByKey } from "./table-schema";
import { invalidateTableSchemasCache } from "./table-schemas/load";
import { ITEMS_SECTION_KEY } from "./views/resolve-tabs";
import { purgeColumnFromViews } from "./views/mutations";

export type DeleteDatabaseColumnError =
  | "database_not_found"
  | "column_not_found"
  | "column_not_deletable";

export interface DeleteDatabaseColumnResult {
  rowsAffected: number;
  relationsUnlinked: number;
}

function removeColumnFromTableSchemas(
  file: TableSchemasFile,
  databaseId: string,
  columnKey: string,
): boolean {
  const table = file.tables[databaseId];
  if (!table) return false;
  const nextColumns = table.columns.filter((col) => col.key !== columnKey);
  if (nextColumns.length === table.columns.length) return false;
  file.tables[databaseId] = { columns: nextColumns };
  return true;
}

export function deleteDatabaseColumn(
  ctx: TomeWriteContext,
  databaseId: string,
  columnKey: string,
): DeleteDatabaseColumnError | DeleteDatabaseColumnResult {
  const normalizedKey = columnKey.trim();
  if (!normalizedKey || normalizedKey === "name" || ROW_META_KEYS.has(normalizedKey)) {
    return "column_not_deletable";
  }

  if (!isTypeTableNode(ctx.db, databaseId, ctx.store.contentDir)) {
    return "database_not_found";
  }

  const dynamicFields = loadDynamicFields(ctx.db, databaseId, ctx.store.contentDir);
  if (dynamicFields.some((field) => field.enabled && field.columnKey === normalizedKey)) {
    return "column_not_deletable";
  }

  const schemasFile = ctx.store.readTableSchemasFile();
  const tableSchema = schemasFile.tables[databaseId];
  if (!tableSchema) {
    return "column_not_found";
  }

  const column = findColumnByKey(tableSchema, normalizedKey);
  if (!column) {
    return "column_not_found";
  }

  let rowsAffected = 0;
  let relationsUnlinked = 0;

  if (column.type === "relation") {
    relationsUnlinked = unlinkRelationColumnFromAllRows(ctx, databaseId, column);
  } else {
    rowsAffected = stripScalarFromMembershipEdges(ctx, databaseId, normalizedKey);
  }

  if (!removeColumnFromTableSchemas(schemasFile, databaseId, normalizedKey)) {
    return "column_not_found";
  }

  ctx.store.writeTableSchemasFile(schemasFile);
  invalidateTableSchemasCache();
  purgeColumnFromViews(ctx.store, databaseId, ITEMS_SECTION_KEY, normalizedKey);

  syncAfterRelationshipsWrite(ctx);
  ctx.sync.syncAfterWrite(TABLE_SCHEMAS_FILENAME);
  ctx.sync.syncAfterWrite("views.json");

  return { rowsAffected, relationsUnlinked };
}
