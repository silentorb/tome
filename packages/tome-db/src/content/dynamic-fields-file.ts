import type {
  DynamicColumnSetRecord,
  DynamicFieldRecord,
  SeedDynamicColumnSetInput,
  SeedDynamicFieldInput,
} from "../dynamic-fields/overlay";

export const DYNAMIC_FIELDS_FILE_VERSION = 1;

export interface DynamicFieldFileEntry {
  id: string;
  databaseId: string;
  columnKey: string;
  columnName: string;
  columnType: string;
  resolverId: string;
  docsPath: string;
  enabled: boolean;
  params?: Record<string, unknown>;
  viewNames?: string[];
}

export interface DynamicColumnSetFileEntry {
  id: string;
  databaseId: string;
  columnKeyPattern: string;
  columnNamePattern: string;
  columnType: string;
  resolverId: string;
  docsPath: string;
  enabled: boolean;
  params?: Record<string, unknown>;
  viewNames?: string[];
}

export interface DynamicFieldsFile {
  version: number;
  fields: DynamicFieldFileEntry[];
  columnSets: DynamicColumnSetFileEntry[];
}

export function emptyDynamicFieldsFile(): DynamicFieldsFile {
  return { version: DYNAMIC_FIELDS_FILE_VERSION, fields: [], columnSets: [] };
}

export function parseDynamicFieldsFile(raw: string): DynamicFieldsFile {
  const data = JSON.parse(raw) as unknown;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("dynamic-fields.json: root must be an object");
  }
  const obj = data as Record<string, unknown>;
  if (typeof obj.version !== "number") {
    throw new Error("dynamic-fields.json: version is required");
  }
  if (!Array.isArray(obj.fields)) {
    throw new Error("dynamic-fields.json: fields must be an array");
  }
  if (!Array.isArray(obj.columnSets)) {
    throw new Error("dynamic-fields.json: columnSets must be an array");
  }
  return {
    version: obj.version,
    fields: obj.fields as DynamicFieldFileEntry[],
    columnSets: obj.columnSets as DynamicColumnSetFileEntry[],
  };
}

export function serializeDynamicFieldsFile(file: DynamicFieldsFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

export function fieldRecordFromEntry(entry: DynamicFieldFileEntry): DynamicFieldRecord {
  return {
    id: entry.id,
    databaseId: entry.databaseId,
    columnKey: entry.columnKey,
    columnName: entry.columnName,
    columnType: entry.columnType,
    resolverId: entry.resolverId,
    docsPath: entry.docsPath,
    enabled: entry.enabled,
    params: entry.params ?? {},
    viewNames: entry.viewNames ?? [],
  };
}

export function columnSetRecordFromEntry(entry: DynamicColumnSetFileEntry): DynamicColumnSetRecord {
  const params = entry.params ?? {};
  const hideLegacyKeys = Array.isArray(params.hide_legacy_keys)
    ? (params.hide_legacy_keys as string[])
    : [];
  return {
    id: entry.id,
    databaseId: entry.databaseId,
    columnKeyPattern: entry.columnKeyPattern,
    columnNamePattern: entry.columnNamePattern,
    columnType: entry.columnType,
    resolverId: entry.resolverId,
    docsPath: entry.docsPath,
    enabled: entry.enabled,
    params,
    viewNames: entry.viewNames ?? [],
    hideLegacyKeys,
  };
}

export function entryFromSeedField(input: SeedDynamicFieldInput): DynamicFieldFileEntry {
  return {
    id: input.id,
    databaseId: input.databaseId,
    columnKey: input.columnKey,
    columnName: input.columnName,
    columnType: input.columnType ?? "number",
    resolverId: input.resolverId,
    docsPath: input.docsPath,
    enabled: true,
    params: input.params,
    viewNames: input.viewNames,
  };
}

export function entryFromSeedColumnSet(input: SeedDynamicColumnSetInput): DynamicColumnSetFileEntry {
  return {
    id: input.id,
    databaseId: input.databaseId,
    columnKeyPattern: input.columnKeyPattern,
    columnNamePattern: input.columnNamePattern,
    columnType: input.columnType ?? "number",
    resolverId: input.resolverId,
    docsPath: input.docsPath,
    enabled: true,
    params: input.params,
    viewNames: input.viewNames,
  };
}

export function fileFromSeedInputs(
  fields: SeedDynamicFieldInput[],
  columnSets: SeedDynamicColumnSetInput[] = [],
): DynamicFieldsFile {
  return {
    version: DYNAMIC_FIELDS_FILE_VERSION,
    fields: fields.map(entryFromSeedField),
    columnSets: columnSets.map(entryFromSeedColumnSet),
  };
}
