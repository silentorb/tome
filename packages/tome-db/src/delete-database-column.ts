import { loadDynamicFields } from "./dynamic-fields";
import {
  ROW_META_KEYS,
  stripScalarFromSetEdges,
  unlinkRelationColumnFromAllRows,
} from "./database-column-data";
import { isTypeTableNode } from "./node-capabilities";
import type { TomeWriteContext } from "./content/write-context";
import { syncAfterRelationshipsWrite } from "./content/write-context";
import { TABLE_SCHEMAS_FILENAME } from "tome-flatfile";
import type { TableSchemasFile } from "tome-flatfile";
import { findColumnByKey } from "tome-flatfile";
import { invalidateTableSchemasCache } from "tome-flatfile";
import { purgeColumnFromViews } from "./views/mutations";
import { setRolePerspectivesForNode } from "tome-flatfile";
import type {
  DeleteDatabaseColumnError,
  DeleteDatabaseColumnResult,
} from "tome-graph-interfaces";

export type {
  DeleteDatabaseColumnError,
  DeleteDatabaseColumnResult,
} from "tome-graph-interfaces";


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

  if (!isTypeTableNode(ctx.cache, databaseId, ctx.store.contentDir)) {
    return "database_not_found";
  }

  const dynamicFields = loadDynamicFields(ctx.cache, databaseId, ctx.store.contentDir);
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
    rowsAffected = stripScalarFromSetEdges(ctx, databaseId, normalizedKey);
  }

  if (!removeColumnFromTableSchemas(schemasFile, databaseId, normalizedKey)) {
    return "column_not_found";
  }

  ctx.store.writeTableSchemasFile(schemasFile);
  invalidateTableSchemasCache();
  purgeColumnFromViews(
    ctx.store,
    databaseId,
    setRolePerspectivesForNode(databaseId, ctx.store.contentDir)[0],
    normalizedKey,
  );

  syncAfterRelationshipsWrite(ctx);
  ctx.sync.syncAfterWrite(TABLE_SCHEMAS_FILENAME);
  ctx.sync.syncAfterWrite("views.json");

  return { rowsAffected, relationsUnlinked };
}
