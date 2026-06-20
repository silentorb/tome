import { existsSync } from "node:fs";
import type { GraphDatabase } from "../graph";
import {
  loadDynamicColumnSetsFromContent,
  loadDynamicFieldsFromContent,
} from "../content/sync";
import { dynamicFieldsFilePath, readEnv, resolveContentPath } from "../content/paths";

export interface DynamicFieldRecord {
  id: string;
  databaseId: string;
  columnKey: string;
  columnName: string;
  columnType: string;
  resolverId: string;
  docsPath: string;
  enabled: boolean;
  params: Record<string, unknown>;
  viewNames: string[];
}

export interface DynamicColumnSetRecord {
  id: string;
  databaseId: string;
  columnKeyPattern: string;
  columnNamePattern: string;
  columnType: string;
  resolverId: string;
  docsPath: string;
  enabled: boolean;
  params: Record<string, unknown>;
  viewNames: string[];
  /** Keys of legacy columns to hide when this set is active. */
  hideLegacyKeys: string[];
}

function parseParams(rows: { param_key: string; param_value: string }[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      out[row.param_key] = JSON.parse(row.param_value);
    } catch {
      out[row.param_key] = row.param_value;
    }
  }
  return out;
}

function contentDirForDynamicFields(explicit?: string): string | null {
  const dir = explicit ?? readEnv("TOME_CONTENT_PATH") ?? resolveContentPath();
  if (existsSync(dynamicFieldsFilePath(dir))) return dir;
  return null;
}

export function loadDynamicFields(
  db: GraphDatabase,
  databaseId: string,
  contentDir?: string,
): DynamicFieldRecord[] {
  const fromContent = contentDirForDynamicFields(contentDir);
  if (fromContent) {
    return loadDynamicFieldsFromContent(fromContent, databaseId);
  }

  const fields = db.queryAll<{
    id: string;
    database_id: string;
    column_key: string;
    column_name: string;
    column_type: string;
    resolver_id: string;
    docs_path: string;
    enabled: number;
  }>(
    `SELECT id, database_id, column_key, column_name, column_type, resolver_id, docs_path, enabled
     FROM dynamic_fields
     WHERE database_id = ? AND enabled = 1`,
    databaseId,
  );

  return fields.map((field) => {
    const params = parseParams(
      db.queryAll<{ param_key: string; param_value: string }>(
        "SELECT param_key, param_value FROM dynamic_field_params WHERE field_id = ?",
        field.id,
      ),
    );
    const viewNames = db
      .queryAll<{ view_name: string }>(
        "SELECT view_name FROM dynamic_field_view_bindings WHERE field_id = ?",
        field.id,
      )
      .map((r) => r.view_name);
    return {
      id: field.id,
      databaseId: field.database_id,
      columnKey: field.column_key,
      columnName: field.column_name,
      columnType: field.column_type,
      resolverId: field.resolver_id,
      docsPath: field.docs_path,
      enabled: field.enabled === 1,
      params,
      viewNames,
    };
  });
}

export function loadDynamicColumnSets(
  db: GraphDatabase,
  databaseId: string,
  contentDir?: string,
): DynamicColumnSetRecord[] {
  const fromContent = contentDirForDynamicFields(contentDir);
  if (fromContent) {
    return loadDynamicColumnSetsFromContent(fromContent, databaseId);
  }

  const sets = db.queryAll<{
    id: string;
    database_id: string;
    column_key_pattern: string;
    column_name_pattern: string;
    column_type: string;
    resolver_id: string;
    docs_path: string;
    enabled: number;
  }>(
    `SELECT id, database_id, column_key_pattern, column_name_pattern, column_type, resolver_id, docs_path, enabled
     FROM dynamic_column_sets
     WHERE database_id = ? AND enabled = 1`,
    databaseId,
  );

  return sets.map((set) => {
    const params = parseParams(
      db.queryAll<{ param_key: string; param_value: string }>(
        "SELECT param_key, param_value FROM dynamic_column_set_params WHERE set_id = ?",
        set.id,
      ),
    );
    const viewNames = db
      .queryAll<{ view_name: string }>(
        "SELECT view_name FROM dynamic_column_set_view_bindings WHERE set_id = ?",
        set.id,
      )
      .map((r) => r.view_name);
    const hideLegacyKeys = Array.isArray(params.hide_legacy_keys)
      ? (params.hide_legacy_keys as string[])
      : [];
    return {
      id: set.id,
      databaseId: set.database_id,
      columnKeyPattern: set.column_key_pattern,
      columnNamePattern: set.column_name_pattern,
      columnType: set.column_type,
      resolverId: set.resolver_id,
      docsPath: set.docs_path,
      enabled: set.enabled === 1,
      params,
      viewNames,
      hideLegacyKeys,
    };
  });
}

export interface SeedDynamicFieldInput {
  id: string;
  databaseId: string;
  columnKey: string;
  columnName: string;
  columnType?: string;
  resolverId: string;
  docsPath: string;
  params?: Record<string, unknown>;
  viewNames?: string[];
}

export interface SeedDynamicColumnSetInput {
  id: string;
  databaseId: string;
  columnKeyPattern: string;
  columnNamePattern: string;
  columnType?: string;
  resolverId: string;
  docsPath: string;
  params?: Record<string, unknown>;
  viewNames?: string[];
}

export function seedDynamicField(db: GraphDatabase, input: SeedDynamicFieldInput): void {
  db.runExec(
    `INSERT INTO dynamic_fields (id, database_id, column_key, column_name, column_type, resolver_id, docs_path, enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)
     ON CONFLICT(id) DO UPDATE SET
       database_id = excluded.database_id,
       column_key = excluded.column_key,
       column_name = excluded.column_name,
       column_type = excluded.column_type,
       resolver_id = excluded.resolver_id,
       docs_path = excluded.docs_path,
       enabled = 1`,
    input.id,
    input.databaseId,
    input.columnKey,
    input.columnName,
    input.columnType ?? "number",
    input.resolverId,
    input.docsPath,
  );
  db.runExec("DELETE FROM dynamic_field_params WHERE field_id = ?", input.id);
  for (const [key, value] of Object.entries(input.params ?? {})) {
    db.runExec(
      "INSERT INTO dynamic_field_params (field_id, param_key, param_value) VALUES (?, ?, ?)",
      input.id,
      key,
      JSON.stringify(value),
    );
  }
  db.runExec("DELETE FROM dynamic_field_view_bindings WHERE field_id = ?", input.id);
  for (const viewName of input.viewNames ?? []) {
    db.runExec(
      "INSERT INTO dynamic_field_view_bindings (field_id, view_name) VALUES (?, ?)",
      input.id,
      viewName,
    );
  }
}

export function seedDynamicColumnSet(db: GraphDatabase, input: SeedDynamicColumnSetInput): void {
  db.runExec(
    `INSERT INTO dynamic_column_sets (id, database_id, column_key_pattern, column_name_pattern, column_type, resolver_id, docs_path, enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)
     ON CONFLICT(id) DO UPDATE SET
       database_id = excluded.database_id,
       column_key_pattern = excluded.column_key_pattern,
       column_name_pattern = excluded.column_name_pattern,
       column_type = excluded.column_type,
       resolver_id = excluded.resolver_id,
       docs_path = excluded.docs_path,
       enabled = 1`,
    input.id,
    input.databaseId,
    input.columnKeyPattern,
    input.columnNamePattern,
    input.columnType ?? "number",
    input.resolverId,
    input.docsPath,
  );
  db.runExec("DELETE FROM dynamic_column_set_params WHERE set_id = ?", input.id);
  for (const [key, value] of Object.entries(input.params ?? {})) {
    db.runExec(
      "INSERT INTO dynamic_column_set_params (set_id, param_key, param_value) VALUES (?, ?, ?)",
      input.id,
      key,
      JSON.stringify(value),
    );
  }
  db.runExec("DELETE FROM dynamic_column_set_view_bindings WHERE set_id = ?", input.id);
  for (const viewName of input.viewNames ?? []) {
    db.runExec(
      "INSERT INTO dynamic_column_set_view_bindings (set_id, view_name) VALUES (?, ?)",
      input.id,
      viewName,
    );
  }
}
