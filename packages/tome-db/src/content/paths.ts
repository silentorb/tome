import { existsSync } from "node:fs";
import { resolve } from "node:path";

export const CONTENT_DATA_SUBDIR = "data";
export const CONTENT_MODEL_SUBDIR = "model";

export const RELATIONSHIPS_FILENAME = "relationships.json";
export const RELATIONSHIP_TYPES_FILENAME = "relationship-types.json";
/** @deprecated Use RELATIONSHIPS_FILENAME. Legacy content file name (pre–relationship terminology). */
export const CONNECTIONS_FILENAME = "connections.json";
export const DYNAMIC_FIELDS_FILENAME = "dynamic-fields.json";
export const SCHEMA_FILENAME = "schema.json";
export const VIEWS_FILENAME = "views.json";
export const TABLE_SCHEMAS_FILENAME = "table-schemas.json";
export const WORKSPACE_FILENAME = "workspace.json";
export const ORDERED_ASSOCIATIONS_FILENAME = "ordered-associations.json";
export const NODE_ID_PATTERN = /^[0-9a-f]{32}$/;
export const NODE_FILE_PATTERN = /^[0-9a-f]{32}\.md$/;

export function isNodeId(id: string): boolean {
  return NODE_ID_PATTERN.test(id);
}

export function nodeFileName(id: string): string {
  if (!isNodeId(id)) throw new Error(`Invalid node id: ${id}`);
  return `${id}.md`;
}

/** Git-tracked node + relationship instance files. */
export function contentDataDir(contentRoot: string): string {
  return resolve(contentRoot, CONTENT_DATA_SUBDIR);
}

/** Workspace model config JSON (schema, views, types registry, dynamic fields). */
export function contentModelDir(contentRoot: string): string {
  return resolve(contentRoot, CONTENT_MODEL_SUBDIR);
}

export function nodeFilePath(contentRoot: string, id: string): string {
  return resolve(contentDataDir(contentRoot), nodeFileName(id));
}

export function relationshipsFilePath(contentRoot: string): string {
  return resolve(contentDataDir(contentRoot), RELATIONSHIPS_FILENAME);
}

export function relationshipTypesFilePath(contentRoot: string): string {
  return resolve(contentModelDir(contentRoot), RELATIONSHIP_TYPES_FILENAME);
}

/** @deprecated Use relationshipsFilePath. */
export function connectionsFilePath(contentRoot: string): string {
  return relationshipsFilePath(contentRoot);
}

export function legacyConnectionsFilePath(contentRoot: string): string {
  return resolve(contentDataDir(contentRoot), CONNECTIONS_FILENAME);
}

export function dynamicFieldsFilePath(contentRoot: string): string {
  return resolve(contentModelDir(contentRoot), DYNAMIC_FIELDS_FILENAME);
}

export function schemaFilePath(contentRoot: string): string {
  return resolve(contentModelDir(contentRoot), SCHEMA_FILENAME);
}

export function viewsFilePath(contentRoot: string): string {
  return resolve(contentModelDir(contentRoot), VIEWS_FILENAME);
}

export function tableSchemasFilePath(contentRoot: string): string {
  return resolve(contentModelDir(contentRoot), TABLE_SCHEMAS_FILENAME);
}

export function workspaceFilePath(contentRoot: string): string {
  return resolve(contentModelDir(contentRoot), WORKSPACE_FILENAME);
}

export function orderedAssociationsFilePath(contentRoot: string): string {
  return resolve(contentModelDir(contentRoot), ORDERED_ASSOCIATIONS_FILENAME);
}

export const DEFAULT_DB_FILENAME = "tome.sqlite";

export function readEnv(name: string): string | undefined {
  return process.env[name];
}

export function resolveContentPath(cwd = process.cwd()): string {
  const fromEnv = readEnv("TOME_CONTENT_PATH");
  if (fromEnv) {
    return resolve(fromEnv);
  }

  let dir = cwd;
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = resolve(dir, "content");
    if (existsSync(candidate)) return candidate;
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }

  return resolve(cwd, "content");
}

export function defaultDbPathForContent(contentRoot: string): string {
  return resolve(contentRoot, "..", "data", DEFAULT_DB_FILENAME);
}
