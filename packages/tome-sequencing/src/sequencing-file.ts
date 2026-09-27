import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

export const SEQUENCING_FILE_VERSION = 1;
export const SEQUENCING_FILENAME = "sequencing.json";

const NODE_ID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const ASSOCIATION_ID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export interface SequencingTableConfig {
  dependsRelationshipType: string;
  dependentsPerspective?: string;
  dependenciesPerspective?: string;
  defaultDuration: number;
  containmentRelationshipType?: string | null;
  durationQuery?: unknown | null;
  parallelQuery?: unknown | null;
}

export interface SequencingFile {
  version: typeof SEQUENCING_FILE_VERSION;
  tables: Record<string, SequencingTableConfig>;
}

export function sequencingFilePath(contentRoot: string): string {
  return resolve(contentRoot, "model", SEQUENCING_FILENAME);
}

function parseNodeId(value: unknown, path: string): string {
  if (typeof value !== "string" || !NODE_ID_RE.test(value)) {
    throw new Error(`${path}: must be a node id (ULID)`);
  }
  return value;
}

function parseRelationshipTypeId(value: unknown, path: string): string {
  if (typeof value !== "string" || !ASSOCIATION_ID_RE.test(value.trim())) {
    throw new Error(`${path}: must be a relationship type id (ULID)`);
  }
  return value.trim();
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
  if (containmentRaw !== undefined) {
    if (containmentRaw === null) config.containmentRelationshipType = null;
    else {
      config.containmentRelationshipType = parseRelationshipTypeId(
        containmentRaw,
        `${path}.containmentRelationshipType`,
      );
    }
  }
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

const cache = new Map<string, { mtimeMs: number; file: SequencingFile }>();

export function invalidateSequencingCache(contentDir?: string): void {
  if (contentDir) cache.delete(contentDir);
  else cache.clear();
}

export function loadSequencingFromContent(contentDir: string): SequencingFile {
  const path = sequencingFilePath(contentDir);
  if (!existsSync(path)) return emptySequencingFile();
  const mtimeMs = statSync(path).mtimeMs;
  const hit = cache.get(contentDir);
  if (hit && hit.mtimeMs === mtimeMs) return hit.file;
  const file = parseSequencingFile(readFileSync(path, "utf-8"));
  cache.set(contentDir, { mtimeMs, file });
  return file;
}

export function loadTableSequencingConfig(
  tableId: string,
  contentDir: string,
): SequencingTableConfig | null {
  return loadSequencingFromContent(contentDir).tables[tableId] ?? null;
}
