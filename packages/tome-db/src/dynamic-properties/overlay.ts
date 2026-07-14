import { existsSync } from "node:fs";
import type { GraphDatabase } from "tome-sqlite";
import {
  loadDynamicColumnSetsFromContent,
  loadDynamicPropertiesFromContent,
} from "../content/sync";
import {
  dynamicPropertiesFilePath,
  readEnv,
  resolveContentPath,
  type DynamicColumnSetRecord,
  type DynamicPropertyRecord,
  type SeedDynamicColumnSetInput,
  type SeedDynamicPropertyInput,
} from "tome-flatfile";

export type {
  DynamicColumnSetRecord,
  DynamicPropertyRecord,
  SeedDynamicColumnSetInput,
  SeedDynamicPropertyInput,
} from "tome-flatfile";

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

function contentDirForDynamicProperties(explicit?: string): string | null {
  const dir = explicit ?? readEnv("TOME_CONTENT_PATH") ?? resolveContentPath();
  if (existsSync(dynamicPropertiesFilePath(dir))) return dir;
  return null;
}

export function loadDynamicProperties(
  db: GraphDatabase,
  owner: string,
  contentDir?: string,
): DynamicPropertyRecord[] {
  const fromContent = contentDirForDynamicProperties(contentDir);
  if (fromContent) {
    return loadDynamicPropertiesFromContent(fromContent, owner);
  }

  try {
    const properties = db.queryAll<{
      id: string;
      database_id: string;
      column_key: string;
      column_name: string;
      column_type: string;
      resolver_id: string;
    }>(
      `SELECT id, database_id, column_key, column_name, column_type, resolver_id
     FROM dynamic_fields
     WHERE database_id = ? AND enabled = 1`,
      owner,
    );

    return properties.map((property) => {
      const params = parseParams(
        db.queryAll<{ param_key: string; param_value: string }>(
          "SELECT param_key, param_value FROM dynamic_field_params WHERE field_id = ?",
          property.id,
        ),
      );
      const viewNames = db
        .queryAll<{ view_name: string }>(
          "SELECT view_name FROM dynamic_field_view_bindings WHERE field_id = ?",
          property.id,
        )
        .map((r) => r.view_name);
      return {
        id: property.id,
        owner: property.database_id,
        columnKey: property.column_key,
        columnName: property.column_name,
        columnType: property.column_type,
        resolverId: property.resolver_id,
        params,
        viewNames,
      };
    });
  } catch {
    return [];
  }
}

export function loadDynamicColumnSets(
  db: GraphDatabase,
  owner: string,
  contentDir?: string,
): DynamicColumnSetRecord[] {
  const fromContent = contentDirForDynamicProperties(contentDir);
  if (fromContent) {
    return loadDynamicColumnSetsFromContent(fromContent, owner);
  }

  try {
    const sets = db.queryAll<{
      id: string;
      database_id: string;
      column_key_pattern: string;
      column_name_pattern: string;
      column_type: string;
      resolver_id: string;
    }>(
      `SELECT id, database_id, column_key_pattern, column_name_pattern, column_type, resolver_id
     FROM dynamic_column_sets
     WHERE database_id = ? AND enabled = 1`,
      owner,
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
        owner: set.database_id,
        columnKeyPattern: set.column_key_pattern,
        columnNamePattern: set.column_name_pattern,
        columnType: set.column_type,
        resolverId: set.resolver_id,
        params,
        viewNames,
        hideLegacyKeys,
      };
    });
  } catch {
    return [];
  }
}

export function seedDynamicProperty(db: GraphDatabase, input: SeedDynamicPropertyInput): void {
  db.runExec(
    `INSERT INTO dynamic_fields (id, database_id, column_key, column_name, column_type, resolver_id, docs_path, enabled)
     VALUES (?, ?, ?, ?, ?, ?, '', 1)
     ON CONFLICT(id) DO UPDATE SET
       database_id = excluded.database_id,
       column_key = excluded.column_key,
       column_name = excluded.column_name,
       column_type = excluded.column_type,
       resolver_id = excluded.resolver_id,
       docs_path = '',
       enabled = 1`,
    input.id,
    input.owner,
    input.columnKey,
    input.columnName,
    input.columnType ?? "number",
    input.resolverId,
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
     VALUES (?, ?, ?, ?, ?, ?, '', 1)
     ON CONFLICT(id) DO UPDATE SET
       database_id = excluded.database_id,
       column_key_pattern = excluded.column_key_pattern,
       column_name_pattern = excluded.column_name_pattern,
       column_type = excluded.column_type,
       resolver_id = excluded.resolver_id,
       docs_path = '',
       enabled = 1`,
    input.id,
    input.owner,
    input.columnKeyPattern,
    input.columnNamePattern,
    input.columnType ?? "number",
    input.resolverId,
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
