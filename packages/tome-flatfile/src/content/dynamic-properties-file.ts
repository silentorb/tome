export const DYNAMIC_PROPERTIES_FILE_VERSION = 1;

export interface DynamicPropertyRecord {
  id: string;
  owner: string;
  columnKey: string;
  columnName: string;
  columnType: string;
  resolverId: string;
  params: Record<string, unknown>;
  viewNames: string[];
}

export interface DynamicColumnSetRecord {
  id: string;
  owner: string;
  columnKeyPattern: string;
  columnNamePattern: string;
  columnType: string;
  resolverId: string;
  params: Record<string, unknown>;
  viewNames: string[];
  /** Keys of legacy columns to hide when this set is active. */
  hideLegacyKeys: string[];
}

export interface SeedDynamicPropertyInput {
  id: string;
  owner: string;
  columnKey: string;
  columnName: string;
  columnType?: string;
  resolverId: string;
  params?: Record<string, unknown>;
  viewNames?: string[];
}

export interface SeedDynamicColumnSetInput {
  id: string;
  owner: string;
  columnKeyPattern: string;
  columnNamePattern: string;
  columnType?: string;
  resolverId: string;
  params?: Record<string, unknown>;
  viewNames?: string[];
}

export interface DynamicPropertyFileEntry {
  id: string;
  owner: string;
  columnKey: string;
  columnName: string;
  columnType: string;
  resolverId: string;
  params?: Record<string, unknown>;
  viewNames?: string[];
}

export interface DynamicColumnSetFileEntry {
  id: string;
  owner: string;
  columnKeyPattern: string;
  columnNamePattern: string;
  columnType: string;
  resolverId: string;
  params?: Record<string, unknown>;
  viewNames?: string[];
}

export interface DynamicPropertiesFile {
  version: number;
  properties: DynamicPropertyFileEntry[];
  columnSets: DynamicColumnSetFileEntry[];
}

export function emptyDynamicPropertiesFile(): DynamicPropertiesFile {
  return { version: DYNAMIC_PROPERTIES_FILE_VERSION, properties: [], columnSets: [] };
}

export function parseDynamicPropertiesFile(raw: string): DynamicPropertiesFile {
  const data = JSON.parse(raw) as unknown;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("dynamic-properties.json: root must be an object");
  }
  const obj = data as Record<string, unknown>;
  if (typeof obj.version !== "number") {
    throw new Error("dynamic-properties.json: version is required");
  }
  if (!Array.isArray(obj.properties)) {
    throw new Error("dynamic-properties.json: properties must be an array");
  }
  if (!Array.isArray(obj.columnSets)) {
    throw new Error("dynamic-properties.json: columnSets must be an array");
  }
  return {
    version: obj.version,
    properties: obj.properties as DynamicPropertyFileEntry[],
    columnSets: obj.columnSets as DynamicColumnSetFileEntry[],
  };
}

export function serializeDynamicPropertiesFile(file: DynamicPropertiesFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

export function propertyRecordFromEntry(entry: DynamicPropertyFileEntry): DynamicPropertyRecord {
  return {
    id: entry.id,
    owner: entry.owner,
    columnKey: entry.columnKey,
    columnName: entry.columnName,
    columnType: entry.columnType,
    resolverId: entry.resolverId,
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
    owner: entry.owner,
    columnKeyPattern: entry.columnKeyPattern,
    columnNamePattern: entry.columnNamePattern,
    columnType: entry.columnType,
    resolverId: entry.resolverId,
    params,
    viewNames: entry.viewNames ?? [],
    hideLegacyKeys,
  };
}

export function entryFromSeedProperty(input: SeedDynamicPropertyInput): DynamicPropertyFileEntry {
  return {
    id: input.id,
    owner: input.owner,
    columnKey: input.columnKey,
    columnName: input.columnName,
    columnType: input.columnType ?? "number",
    resolverId: input.resolverId,
    params: input.params,
    viewNames: input.viewNames,
  };
}

export function entryFromSeedColumnSet(input: SeedDynamicColumnSetInput): DynamicColumnSetFileEntry {
  return {
    id: input.id,
    owner: input.owner,
    columnKeyPattern: input.columnKeyPattern,
    columnNamePattern: input.columnNamePattern,
    columnType: input.columnType ?? "number",
    resolverId: input.resolverId,
    params: input.params,
    viewNames: input.viewNames,
  };
}

export function fileFromSeedInputs(
  properties: SeedDynamicPropertyInput[],
  columnSets: SeedDynamicColumnSetInput[] = [],
): DynamicPropertiesFile {
  return {
    version: DYNAMIC_PROPERTIES_FILE_VERSION,
    properties: properties.map(entryFromSeedProperty),
    columnSets: columnSets.map(entryFromSeedColumnSet),
  };
}
