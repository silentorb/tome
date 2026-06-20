import type { GraphDatabase } from "./graph";
import type { DatabaseColumnDef } from "./database-view";
import { resolveContentPath } from "./content/paths";
import type { TableColumnDef, TableSchema } from "./content/table-schemas-file";
import { getTableSchema } from "./table-schema";
import { loadTableSchemasFromContent } from "./table-schemas/load";
import { relationType } from "./relation-type";
import {
  coalescePriorityValue,
  enrichColumnDef,
  enrichColumnDefs,
  isPriorityColumnKey,
} from "./property-enums";

export interface BuildDatabaseColumnDefsOptions {
  excludeKeys?: Set<string>;
  contentDir?: string;
}

function databaseColumnFromTableColumn(col: TableColumnDef): DatabaseColumnDef {
  if (col.type === "relation") {
    return {
      key: col.key,
      name: col.name,
      type: col.type,
      relationType: col.perspective ?? relationType(col.name),
      targetDatabaseId: col.targetTypeId,
    };
  }
  const base: DatabaseColumnDef = {
    key: col.key,
    name: col.name,
    type: col.type,
  };
  if (col.enumId) {
    base.enumId = col.enumId;
  }
  return enrichColumnDef(base);
}

export function mergeDynamicColumnDefs(
  columnDefs: DatabaseColumnDef[],
  dynamicColumnDefs: DatabaseColumnDef[],
  hiddenColumnKeys: Set<string>,
): DatabaseColumnDef[] {
  const dynamicByKey = new Map(dynamicColumnDefs.map((c) => [c.key, c]));
  const merged: DatabaseColumnDef[] = [];

  for (const col of columnDefs) {
    if (hiddenColumnKeys.has(col.key)) continue;
    const dynamic = dynamicByKey.get(col.key);
    if (dynamic) {
      merged.push(dynamic);
      dynamicByKey.delete(col.key);
    } else {
      merged.push(col);
    }
  }

  for (const col of dynamicByKey.values()) {
    merged.push(col);
  }

  return merged;
}

/** Build typed column definitions from table-schemas.json. */
export function buildDatabaseColumnDefs(
  db: GraphDatabase,
  databaseId: string,
  dynamicColumnDefs: DatabaseColumnDef[],
  hiddenColumnKeys: Set<string>,
  options?: BuildDatabaseColumnDefsOptions,
): DatabaseColumnDef[] {
  const contentDir = options?.contentDir ?? resolveContentPath();
  const tableSchemas = loadTableSchemasFromContent(contentDir);
  const schema = getTableSchema(tableSchemas, databaseId);
  const excludeKeys = options?.excludeKeys ?? new Set<string>();

  const columnDefs: DatabaseColumnDef[] = [];
  if (schema) {
    for (const col of schema.columns) {
      if (excludeKeys.has(col.key)) continue;
      columnDefs.push(databaseColumnFromTableColumn(col));
    }
  }

  const merged = mergeDynamicColumnDefs(columnDefs, dynamicColumnDefs, hiddenColumnKeys);
  return enrichColumnDefs(merged.filter((col) => !excludeKeys.has(col.key)));
}

export function normalizeRowCells(
  cells: Record<string, string>,
  columnDefs: DatabaseColumnDef[],
): Record<string, string> {
  if (columnDefs.length === 0) return cells;
  const out: Record<string, string> = {};
  for (const col of columnDefs) {
    const value =
      cells[col.key] ??
      cells[col.name] ??
      Object.entries(cells).find(
        ([k]) => k.toLowerCase() === col.name.toLowerCase(),
      )?.[1];
    if (value !== undefined) {
      out[col.key] = value;
    } else if (isPriorityColumnKey(col.key) || col.enumId === "priority") {
      out[col.key] = coalescePriorityValue(undefined);
    }
  }
  return out;
}

export function loadTableSchemaForDatabase(
  databaseId: string,
  contentDir?: string,
): TableSchema | null {
  const dir = contentDir ?? resolveContentPath();
  const tableSchemas = loadTableSchemasFromContent(dir);
  return getTableSchema(tableSchemas, databaseId);
}

/** @deprecated Use loadTableSchemaForDatabase */
export const parseDatabaseSchema = loadTableSchemaForDatabase;
