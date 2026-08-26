import {
  renameScalarOnSetEdges,
  ROW_META_KEYS,
  stripScalarFromSetEdges,
  unlinkRelationColumnFromAllRows,
} from "./database-column-data";
import { loadDynamicProperties } from "./dynamic-properties";
import { isTypeTableNode } from "./node-capabilities";
import { normalizeAssociationId, isAssociationId } from "tome-flatfile";
import { resolvePropertyEnumFromContent } from "./property-enums";
import type { TomeWriteContext } from "./content/write-context";
import { syncAfterRelationshipsWrite } from "./content/write-context";
import { writeStoreContentDir } from "./graph-store/relationship-write";
import { TABLE_SCHEMAS_FILENAME } from "tome-flatfile";
import { isNodeId } from "tome-flatfile";
import type {
  TableColumnDef,
  TableColumnScalarType,
  TableColumnType,
  TableRelationColumn,
  TableScalarColumn,
  TableSchemasFile,
} from "tome-flatfile";
import { findColumnByKey, slugifyPropertyKey } from "tome-flatfile";
import { invalidateTableSchemasCache } from "tome-flatfile";
import {
  appendColumnToViewsOrder,
  renameColumnInViews,
} from "./views/mutations";
import { setRoleAssociationForNode } from "tome-flatfile";
import type {
  CreateDatabaseColumnInput,
  DatabaseColumnMutationError,
  DatabaseColumnMutationResult,
  UpdateDatabaseColumnInput,
} from "tome-graph-interfaces";

export type {
  CreateDatabaseColumnInput,
  DatabaseColumnMutationError,
  DatabaseColumnMutationResult,
  UpdateDatabaseColumnInput,
} from "tome-graph-interfaces";


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
  const dynamicProperties = loadDynamicProperties(ctx.graphStore, databaseId, writeStoreContentDir(ctx.graphStore));
  return dynamicProperties.some((property) => property.columnKey === columnKey);
}

function validateScalarType(type: string): type is TableColumnScalarType {
  return SCALAR_TYPES.has(type);
}

function validateEnumId(ctx: TomeWriteContext, enumId: string | undefined): boolean {
  if (!enumId?.trim()) return false;
  return resolvePropertyEnumFromContent(enumId.trim(), writeStoreContentDir(ctx.graphStore)) !== null;
}

function buildColumnDef(input: CreateDatabaseColumnInput, key: string): TableColumnDef | null {
  const name = input.name.trim();
  if (!name) return null;

  if (input.type === "relation") {
    if (!input.association?.trim()) return null;
    const association = normalizeAssociationId(input.association);
    if (!isAssociationId(association)) return null;
    return {
      key,
      name,
      type: "relation",
      association,
    };
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
  if (!isTypeTableNode(ctx.graphStore, databaseId, writeStoreContentDir(ctx.graphStore))) {
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
  } else {
    const registry = ctx.graphStore.readAssociations();
    if (!registry.associations[columnDef.association]) {
      return "invalid_relation_target";
    }
  }

  const schemasFile = ctx.graphStore.readTableSchemas();
  const tableSchema = ensureTableSchema(schemasFile, databaseId);
  if (columnKeysTaken(tableSchema).has(key)) {
    return "column_key_taken";
  }

  tableSchema.columns.push(columnDef);
  ctx.graphStore.writeTableSchemas(schemasFile);
  invalidateTableSchemasCache();
  appendColumnToViewsOrder(
    ctx.graphStore,
    databaseId,
    setRoleAssociationForNode(databaseId, writeStoreContentDir(ctx.graphStore)),
    key,
    input.viewId,
  );

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
    const associationRaw =
      input.association ??
      (existing.type === "relation" ? existing.association : "");
    const association = normalizeAssociationId(associationRaw);
    if (!association || !isAssociationId(association)) return null;
    return {
      key: existing.key,
      name,
      type: "relation",
      association,
    };
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
  return oldCol.association !== newCol.association;
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

  if (!isTypeTableNode(ctx.graphStore, databaseId, writeStoreContentDir(ctx.graphStore))) {
    return "database_not_found";
  }

  const schemasFile = ctx.graphStore.readTableSchemas();
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
  } else {
    const registry = ctx.graphStore.readAssociations();
    if (!registry.associations[(patched as TableRelationColumn).association]) {
      return "invalid_relation_target";
    }
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
    valuesCleared += stripScalarFromSetEdges(ctx, databaseId, normalizedKey);
  }

  if (!wasRelation && !willRelation && finalKey !== normalizedKey) {
    rowsMigrated += renameScalarOnSetEdges(ctx, databaseId, normalizedKey, finalKey);
  }

  patched.key = finalKey;
  const index = tableSchema.columns.findIndex((col) => col.key === normalizedKey);
  tableSchema.columns[index] = patched;

  ctx.graphStore.writeTableSchemas(schemasFile);
  invalidateTableSchemasCache();

  if (finalKey !== normalizedKey) {
    renameColumnInViews(
      ctx.graphStore,
      databaseId,
      setRoleAssociationForNode(databaseId, writeStoreContentDir(ctx.graphStore)),
      normalizedKey,
      finalKey,
    );
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
