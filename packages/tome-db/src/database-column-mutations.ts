import {
  renameScalarOnMembershipEdges,
  ROW_META_KEYS,
  stripScalarFromMembershipEdges,
  unlinkRelationColumnFromAllRows,
} from "./database-column-data";
import { loadDynamicFields } from "./dynamic-fields";
import { isTypeTableNode } from "./node-capabilities";
import { relationType } from "./relation-type";
import { resolvePropertyEnumFromContent } from "./property-enums";
import type { TomeWriteContext } from "./content/write-context";
import { syncAfterRelationshipsWrite } from "./content/write-context";
import { TABLE_SCHEMAS_FILENAME } from "./content/paths";
import { isNodeId } from "./content/paths";
import type {
  TableColumnDef,
  TableColumnScalarType,
  TableColumnType,
  TableRelationColumn,
  TableScalarColumn,
  TableSchemasFile,
} from "./content/table-schemas-file";
import { findColumnByKey, slugifyPropertyKey } from "./table-schema";
import { invalidateTableSchemasCache } from "./table-schemas/load";
import { ITEMS_SECTION_KEY } from "./views/resolve-tabs";
import {
  appendColumnToViewsOrder,
  renameColumnInViews,
} from "./views/mutations";

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
  targetTypeId?: string;
  perspective?: string;
}

export interface UpdateDatabaseColumnInput {
  name?: string;
  newKey?: string;
  type?: TableColumnType;
  enumId?: string | null;
  targetTypeId?: string;
  perspective?: string;
}

export interface DatabaseColumnMutationResult {
  column: TableColumnDef;
  rowsMigrated: number;
  relationsUnlinked: number;
  valuesCleared: number;
}

const SCALAR_TYPES = new Set<string>([
  "checkbox",
  "date",
  "email",
  "files",
  "multi_select",
  "number",
  "phone_number",
  "rich_text",
  "select",
  "status",
  "text",
  "url",
]);

function normalizeKey(raw: string | undefined, name: string): string | null {
  const key = (raw?.trim() || slugifyPropertyKey(name)).toLowerCase();
  if (!key || key === "name" || ROW_META_KEYS.has(key)) return null;
  if (!/^[a-z][a-z0-9_]*$/.test(key)) return null;
  return key;
}

function isDynamicColumnKey(
  ctx: TomeWriteContext,
  databaseId: string,
  columnKey: string,
): boolean {
  const dynamicFields = loadDynamicFields(ctx.db, databaseId, ctx.store.contentDir);
  return dynamicFields.some((field) => field.enabled && field.columnKey === columnKey);
}

function validateScalarType(type: string): type is TableColumnScalarType {
  return SCALAR_TYPES.has(type);
}

function validateEnumId(ctx: TomeWriteContext, enumId: string | undefined): boolean {
  if (!enumId?.trim()) return false;
  return resolvePropertyEnumFromContent(enumId.trim(), ctx.store.contentDir) !== null;
}

function buildColumnDef(input: CreateDatabaseColumnInput, key: string): TableColumnDef | null {
  const name = input.name.trim();
  if (!name) return null;

  if (input.type === "relation") {
    if (!input.targetTypeId || !isNodeId(input.targetTypeId)) return null;
    const column: TableRelationColumn = {
      key,
      name,
      type: "relation",
      targetTypeId: input.targetTypeId.toLowerCase(),
    };
    if (input.perspective?.trim()) {
      column.perspective = input.perspective.trim();
    }
    return column;
  }

  if (!validateScalarType(input.type)) return null;
  const column: TableScalarColumn = {
    key,
    name,
    type: input.type,
  };
  if (input.type === "select" || input.type === "status") {
    if (!input.enumId?.trim()) return null;
    column.enumId = input.enumId.trim();
  } else if (input.enumId?.trim()) {
    column.enumId = input.enumId.trim();
  }
  return column;
}

function ensureTableSchema(
  file: TableSchemasFile,
  databaseId: string,
): { columns: TableColumnDef[] } {
  if (!file.tables[databaseId]) {
    file.tables[databaseId] = { columns: [] };
  }
  return file.tables[databaseId]!;
}

function columnKeysTaken(schema: { columns: TableColumnDef[] }, excludeKey?: string): Set<string> {
  return new Set(
    schema.columns.filter((col) => col.key !== excludeKey).map((col) => col.key),
  );
}

export function createDatabaseColumn(
  ctx: TomeWriteContext,
  databaseId: string,
  input: CreateDatabaseColumnInput,
): DatabaseColumnMutationError | DatabaseColumnMutationResult {
  if (!isTypeTableNode(ctx.db, databaseId, ctx.store.contentDir)) {
    return "database_not_found";
  }

  const name = input.name.trim();
  if (!name) return "invalid_name";

  const key = normalizeKey(input.key, name);
  if (!key) return "invalid_key";

  if (isDynamicColumnKey(ctx, databaseId, key)) {
    return "column_key_taken";
  }

  const columnDef = buildColumnDef(input, key);
  if (!columnDef) {
    if (input.type === "relation") return "invalid_relation_target";
    if (input.type === "select" || input.type === "status") return "invalid_enum";
    return "invalid_type";
  }

  if (columnDef.type !== "relation") {
    if (columnDef.type === "select" || columnDef.type === "status") {
      if (!validateEnumId(ctx, columnDef.enumId)) return "invalid_enum";
    }
  } else if (!isTypeTableNode(ctx.db, columnDef.targetTypeId, ctx.store.contentDir)) {
    return "invalid_relation_target";
  }

  const schemasFile = ctx.store.readTableSchemasFile();
  const tableSchema = ensureTableSchema(schemasFile, databaseId);
  if (columnKeysTaken(tableSchema).has(key)) {
    return "column_key_taken";
  }

  tableSchema.columns.push(columnDef);
  ctx.store.writeTableSchemasFile(schemasFile);
  invalidateTableSchemasCache();
  appendColumnToViewsOrder(ctx.store, databaseId, ITEMS_SECTION_KEY, key);

  ctx.sync.syncAfterWrite(TABLE_SCHEMAS_FILENAME);
  ctx.sync.syncAfterWrite("views.json");

  return {
    column: columnDef,
    rowsMigrated: 0,
    relationsUnlinked: 0,
    valuesCleared: 0,
  };
}

function applyColumnPatch(
  existing: TableColumnDef,
  input: UpdateDatabaseColumnInput,
): TableColumnDef | null {
  const name = input.name !== undefined ? input.name.trim() : existing.name;
  if (!name) return null;

  const nextType = input.type ?? existing.type;

  if (nextType === "relation") {
    const targetTypeId =
      input.targetTypeId ??
      (existing.type === "relation" ? existing.targetTypeId : undefined);
    if (!targetTypeId || !isNodeId(targetTypeId)) return null;
    const column: TableRelationColumn = {
      key: existing.key,
      name,
      type: "relation",
      targetTypeId: targetTypeId.toLowerCase(),
    };
    if (input.perspective !== undefined) {
      if (input.perspective.trim()) column.perspective = input.perspective.trim();
    } else if (existing.type === "relation" && existing.perspective) {
      column.perspective = existing.perspective;
    }
    return column;
  }

  if (!validateScalarType(nextType)) return null;
  const column: TableScalarColumn = {
    key: existing.key,
    name,
    type: nextType,
  };

  if (nextType === "select" || nextType === "status") {
    const enumId =
      input.enumId !== undefined
        ? input.enumId?.trim() || undefined
        : existing.type !== "relation"
          ? existing.enumId
          : undefined;
    if (!enumId) return null;
    column.enumId = enumId;
  } else if (input.enumId !== undefined && input.enumId?.trim()) {
    column.enumId = input.enumId.trim();
  } else if (existing.type !== "relation" && existing.enumId) {
    column.enumId = existing.enumId;
  }

  return column;
}

function relationConfigChanged(
  oldCol: TableColumnDef & { type: "relation" },
  newCol: TableColumnDef & { type: "relation" },
): boolean {
  const oldPerspective = oldCol.perspective ?? relationType(oldCol.name);
  const newPerspective = newCol.perspective ?? relationType(newCol.name);
  return oldCol.targetTypeId !== newCol.targetTypeId || oldPerspective !== newPerspective;
}

export function updateDatabaseColumn(
  ctx: TomeWriteContext,
  databaseId: string,
  columnKey: string,
  input: UpdateDatabaseColumnInput,
): DatabaseColumnMutationError | DatabaseColumnMutationResult {
  const normalizedKey = columnKey.trim();
  if (!normalizedKey || normalizedKey === "name" || ROW_META_KEYS.has(normalizedKey)) {
    return "column_not_deletable";
  }

  if (!isTypeTableNode(ctx.db, databaseId, ctx.store.contentDir)) {
    return "database_not_found";
  }

  const schemasFile = ctx.store.readTableSchemasFile();
  const tableSchema = schemasFile.tables[databaseId];
  if (!tableSchema) return "column_not_found";

  const existing = findColumnByKey(tableSchema, normalizedKey);
  if (!existing) return "column_not_found";

  const patched = applyColumnPatch(existing, input);
  if (!patched) {
    if (input.type === "relation" || existing.type === "relation") {
      return "invalid_relation_target";
    }
    if (input.type === "select" || input.type === "status") return "invalid_enum";
    if (input.name !== undefined && !input.name.trim()) return "invalid_name";
    return "invalid_type";
  }

  if (patched.type !== "relation") {
    if (patched.type === "select" || patched.type === "status") {
      if (!validateEnumId(ctx, patched.enumId)) return "invalid_enum";
    }
  } else if (!isTypeTableNode(ctx.db, patched.targetTypeId, ctx.store.contentDir)) {
    return "invalid_relation_target";
  }

  const newKeyRaw = input.newKey?.trim();
  const newKey = newKeyRaw ? normalizeKey(newKeyRaw, newKeyRaw) : null;
  if (newKeyRaw && !newKey) return "invalid_key";

  const finalKey = newKey ?? normalizedKey;
  if (finalKey !== normalizedKey && isDynamicColumnKey(ctx, databaseId, finalKey)) {
    return "column_key_taken";
  }
  if (finalKey !== normalizedKey && columnKeysTaken(tableSchema, normalizedKey).has(finalKey)) {
    return "column_key_taken";
  }

  let rowsMigrated = 0;
  let relationsUnlinked = 0;
  let valuesCleared = 0;

  const wasRelation = existing.type === "relation";
  const willRelation = patched.type === "relation";

  if (wasRelation && (!willRelation || relationConfigChanged(existing, patched as TableRelationColumn))) {
    relationsUnlinked += unlinkRelationColumnFromAllRows(ctx, databaseId, existing);
  }

  if (!wasRelation && willRelation) {
    valuesCleared += stripScalarFromMembershipEdges(ctx, databaseId, normalizedKey);
  }

  if (!wasRelation && !willRelation && finalKey !== normalizedKey) {
    rowsMigrated += renameScalarOnMembershipEdges(ctx, databaseId, normalizedKey, finalKey);
  }

  patched.key = finalKey;
  const index = tableSchema.columns.findIndex((col) => col.key === normalizedKey);
  tableSchema.columns[index] = patched;

  ctx.store.writeTableSchemasFile(schemasFile);
  invalidateTableSchemasCache();

  if (finalKey !== normalizedKey) {
    renameColumnInViews(ctx.store, databaseId, ITEMS_SECTION_KEY, normalizedKey, finalKey);
  }

  syncAfterRelationshipsWrite(ctx);
  ctx.sync.syncAfterWrite(TABLE_SCHEMAS_FILENAME);
  ctx.sync.syncAfterWrite("views.json");

  return {
    column: patched,
    rowsMigrated,
    relationsUnlinked,
    valuesCleared,
  };
}
