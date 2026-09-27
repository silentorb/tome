import { isNodeId } from "../content/paths";
import { isRelationshipTypeId, normalizeRelationshipTypeId } from "../content/relationship-types-file";

export const SEQUENCING_FILE_VERSION = 1;

/** Per–type-table sequencing interpretation config (not event population). */
export interface SequencingTableConfig {
  dependsRelationshipType: string;
  dependentsPerspective?: string;
  dependenciesPerspective?: string;
  defaultDuration: number;
  containmentRelationshipType?: string | null;
  /** Agent-authored Imp Graph JSON, or null. */
  durationQuery?: unknown | null;
  /** Agent-authored Imp Graph JSON, or null. */
  parallelQuery?: unknown | null;
}

export interface SequencingFile {
  version: typeof SEQUENCING_FILE_VERSION;
  tables: Record<string, SequencingTableConfig>;
}

function parseNodeId(value: unknown, path: string): string {
  if (typeof value !== "string" || !isNodeId(value)) {
    throw new Error(`${path}: must be a node id (ULID)`);
  }
  return value;
}

function parseRelationshipTypeId(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${path}: must be a non-empty string`);
  }
  const id = normalizeRelationshipTypeId(value);
  if (!isRelationshipTypeId(id)) {
    throw new Error(`${path}: must be a relationship type id (ULID)`);
  }
  return id;
}

function parseOptionalRelationshipType(
  value: unknown,
  path: string,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return parseRelationshipTypeId(value, path);
}

function parseOptionalString(value: unknown, path: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${path}: must be a non-empty string`);
  }
  return value.trim();
}

/** Preferred key, or legacy `dependsAssociation` / `containmentAssociation`. */
function pickRelationshipTypeField(
  obj: Record<string, unknown>,
  preferred: string,
  legacy: string,
): unknown {
  if (preferred in obj) return obj[preferred];
  if (legacy in obj) return obj[legacy];
  return undefined;
}

function parseTableConfig(raw: unknown, path: string): SequencingTableConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${path}: must be an object`);
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.defaultDuration !== "number" || !(obj.defaultDuration > 0)) {
    throw new Error(`${path}.defaultDuration: must be a positive number`);
  }
  const dependsRaw = pickRelationshipTypeField(
    obj,
    "dependsRelationshipType",
    "dependsAssociation",
  );
  const config: SequencingTableConfig = {
    dependsRelationshipType: parseRelationshipTypeId(
      dependsRaw,
      `${path}.dependsRelationshipType`,
    ),
    defaultDuration: obj.defaultDuration,
  };
  const dependentsPerspective = parseOptionalString(
    obj.dependentsPerspective,
    `${path}.dependentsPerspective`,
  );
  if (dependentsPerspective !== undefined) config.dependentsPerspective = dependentsPerspective;
  const dependenciesPerspective = parseOptionalString(
    obj.dependenciesPerspective,
    `${path}.dependenciesPerspective`,
  );
  if (dependenciesPerspective !== undefined) {
    config.dependenciesPerspective = dependenciesPerspective;
  }
  const containmentRaw = pickRelationshipTypeField(
    obj,
    "containmentRelationshipType",
    "containmentAssociation",
  );
  const containment = parseOptionalRelationshipType(
    containmentRaw,
    `${path}.containmentRelationshipType`,
  );
  if (containment !== undefined) config.containmentRelationshipType = containment;
  if ("durationQuery" in obj) config.durationQuery = obj.durationQuery ?? null;
  if ("parallelQuery" in obj) config.parallelQuery = obj.parallelQuery ?? null;
  return config;
}

export function emptySequencingFile(): SequencingFile {
  return { version: SEQUENCING_FILE_VERSION, tables: {} };
}

export function parseSequencingFile(raw: string): SequencingFile {
  const data = JSON.parse(raw) as unknown;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("sequencing.json: root must be an object");
  }
  const obj = data as Record<string, unknown>;
  if (obj.version !== SEQUENCING_FILE_VERSION) {
    throw new Error(`sequencing.json: unsupported version ${String(obj.version)}`);
  }
  if (!obj.tables || typeof obj.tables !== "object" || Array.isArray(obj.tables)) {
    throw new Error("sequencing.json: tables must be an object");
  }
  const tables: Record<string, SequencingTableConfig> = {};
  for (const [key, value] of Object.entries(obj.tables as Record<string, unknown>)) {
    const tableId = parseNodeId(key, `sequencing.json tables.${key}`);
    tables[tableId] = parseTableConfig(value, `sequencing.json tables.${tableId}`);
  }
  return { version: SEQUENCING_FILE_VERSION, tables };
}

export function serializeSequencingFile(file: SequencingFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}
