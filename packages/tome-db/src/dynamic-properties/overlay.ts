import { existsSync } from "node:fs";
import type { GraphDatabase } from "tome-sqlite";
import type { RelationshipReadStore } from "../graph-store/relationship-read";
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

function contentDirForDynamicProperties(explicit?: string): string | null {
  const dir = explicit ?? readEnv("TOME_CONTENT_PATH") ?? resolveContentPath();
  if (existsSync(dynamicPropertiesFilePath(dir))) return dir;
  return null;
}

export function loadDynamicProperties(
  _db: RelationshipReadStore,
  owner: string,
  contentDir?: string,
): DynamicPropertyRecord[] {
  const fromContent = contentDirForDynamicProperties(contentDir);
  if (fromContent) {
    return loadDynamicPropertiesFromContent(fromContent, owner);
  }
  return [];
}

export function loadDynamicColumnSets(
  _db: RelationshipReadStore,
  owner: string,
  contentDir?: string,
): DynamicColumnSetRecord[] {
  const fromContent = contentDirForDynamicProperties(contentDir);
  if (fromContent) {
    return loadDynamicColumnSetsFromContent(fromContent, owner);
  }
  return [];
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
}
