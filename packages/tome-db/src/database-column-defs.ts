import type { GraphDatabase } from "tome-sqlite";
import type { DatabaseColumnDef } from "./database-view";
import { resolveContentPath } from "tome-flatfile";
import type { TableColumnDef, TableSchema } from "tome-flatfile";
import { getTableSchema } from "tome-flatfile";
import { loadTableSchemasFromContent } from "tome-flatfile";
import { loadRelationshipTypesFromContent } from "tome-flatfile";
import {
  perspectiveForRelationColumn,
  relationColumnCompositeType,
  targetTypeIdForRelationColumn,
} from "tome-flatfile";
import { enrichColumnDef, enrichColumnDefs, coalescePriorityValue, isPriorityColumnKey } from "./property-enums";
import { loadSchemaFromContent } from "tome-flatfile";
import type { SchemaFile } from "tome-flatfile/schema-file";

export interface BuildDatabaseColumnDefsOptions {
  excludeKeys?: Set<string>;
  contentDir?: string;
}

function databaseColumnFromTableColumn(
  col: TableColumnDef,
  schema: SchemaFile,
  databaseId: string,
  contentDir: string,
): DatabaseColumnDef {
  if (col.type === "relation") {
    const registry = loadRelationshipTypesFromContent(contentDir);
    return {
      key: col.key,
      name: col.name,
      type: col.type,
      relationType: perspectiveForRelationColumn(registry, databaseId, col),
      relationshipCompositeType: relationColumnCompositeType(col),
      targetDatabaseId: targetTypeIdForRelationColumn(registry, databaseId, col) ?? undefined,
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
  return enrichColumnDef(base, schema);
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
  const schemaFile = loadSchemaFromContent(contentDir);
  const excludeKeys = options?.excludeKeys ?? new Set<string>();

  const columnDefs: DatabaseColumnDef[] = [];
  if (schema) {
    for (const col of schema.columns) {
      if (excludeKeys.has(col.key)) continue;
      columnDefs.push(databaseColumnFromTableColumn(col, schemaFile, databaseId, contentDir));
    }
  }

  const merged = mergeDynamicColumnDefs(columnDefs, dynamicColumnDefs, hiddenColumnKeys);
  return enrichColumnDefs(merged.filter((col) => !excludeKeys.has(col.key)), schemaFile);
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
