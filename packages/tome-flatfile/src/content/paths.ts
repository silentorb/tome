import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { NODE_ID_PATTERN, NODE_FILE_PATTERN, isNodeId } from "../node-id";
import { relationshipRelativePath } from "./relationship-path";

export const CONTENT_DATA_SUBDIR = "data";
export const CONTENT_ARCHIVE_SUBDIR = "archive";
export const CONTENT_MODEL_SUBDIR = "model";
export const CONTENT_NODES_SUBDIR = "nodes";
export const CONTENT_RELATIONSHIPS_SUBDIR = "relationships";

/** Basename marker used for cache sync routing (not a real on-disk file). */
export const RELATIONSHIPS_SYNC_MARKER = "relationships";

/** @deprecated Legacy monolithic relationships file under data/. */
export const RELATIONSHIPS_FILENAME = "relationships.json";
export const ASSOCIATIONS_FILENAME = "associations.json";
/** @deprecated Use RELATIONSHIPS_FILENAME. Legacy content file name (pre–relationship terminology). */
export const CONNECTIONS_FILENAME = "connections.json";
export const DYNAMIC_PROPERTIES_FILENAME = "dynamic-properties.json";
export const SCHEMA_FILENAME = "schema.json";
export const VIEWS_FILENAME = "views.json";
export const TABLE_SCHEMAS_FILENAME = "table-schemas.json";
export const WORKSPACE_FILENAME = "workspace.json";
export const TABLE_PRESENTATION_FILENAME = "table-presentation.json";
export const EXTENSIONS_FILENAME = "extensions.json";
export { NODE_ID_PATTERN, NODE_FILE_PATTERN, isNodeId };

/** Matches a relationship shard JSON basename (`{62 hex}.json`). */
export const RELATIONSHIP_FILE_PATTERN = /^[0-9A-F]{62}\.json$/;

export function nodeFileName(id: string): string {
  if (!isNodeId(id)) throw new Error(`Invalid node id: ${id}`);
  return `${id}.md`;
}

/**
 * Shard directory for a node file: first two entropy characters of the ULID
 * (chars 10–11; skip the 10-char timestamp prefix).
 */
export function nodeShardDir(id: string): string {
  if (!isNodeId(id)) throw new Error(`Invalid node id: ${id}`);
  return id.slice(10, 12);
}

/**
 * Path relative to a nodes root (`data/nodes` or `archive/nodes`):
 * `{shard}/{id}.md`.
 */
export function nodeRelativePath(id: string): string {
  return `${nodeShardDir(id)}/${nodeFileName(id)}`;
}

/** Git-tracked instance data root (`content/data`). */
export function contentDataDir(contentRoot: string): string {
  return resolve(contentRoot, CONTENT_DATA_SUBDIR);
}

/** Archived instance data root (`content/archive`). */
export function contentArchiveDir(contentRoot: string): string {
  return resolve(contentRoot, CONTENT_ARCHIVE_SUBDIR);
}

/** Live node markdown tree. */
export function contentNodesDir(contentRoot: string): string {
  return resolve(contentDataDir(contentRoot), CONTENT_NODES_SUBDIR);
}

/** Archived node markdown tree. */
export function contentNodesArchiveDir(contentRoot: string): string {
  return resolve(contentArchiveDir(contentRoot), CONTENT_NODES_SUBDIR);
}

/** Live relationship shard tree. */
export function contentRelationshipsDir(contentRoot: string): string {
  return resolve(contentDataDir(contentRoot), CONTENT_RELATIONSHIPS_SUBDIR);
}

/** Archived relationship shard tree. */
export function contentRelationshipsArchiveDir(contentRoot: string): string {
  return resolve(contentArchiveDir(contentRoot), CONTENT_RELATIONSHIPS_SUBDIR);
}

/** Workspace model config JSON (schema, views, types registry, dynamic properties). */
export function contentModelDir(contentRoot: string): string {
  return resolve(contentRoot, CONTENT_MODEL_SUBDIR);
}

/**
 * Absolute path for a node file.
 * @param archived when true, under `archive/nodes/`; otherwise `data/nodes/`.
 */
export function nodeFilePath(contentRoot: string, id: string, archived = false): string {
  const root = archived ? contentNodesArchiveDir(contentRoot) : contentNodesDir(contentRoot);
  return resolve(root, nodeRelativePath(id));
}

/**
 * Absolute path for a relationship file.
 * @param archived when true, under `archive/relationships/`; otherwise `data/relationships/`.
 */
export function relationshipFilePath(
  contentRoot: string,
  a: string,
  b: string,
  type: string,
  archived = false,
): string {
  const rel = relationshipRelativePath(a, b, type);
  const root = archived
    ? contentRelationshipsArchiveDir(contentRoot)
    : contentRelationshipsDir(contentRoot);
  return resolve(root, rel);
}

/** @deprecated Legacy monolithic path `data/relationships.json`. */
export function relationshipsFilePath(contentRoot: string): string {
  return resolve(contentDataDir(contentRoot), RELATIONSHIPS_FILENAME);
}

export function associationsFilePath(contentRoot: string): string {
  return resolve(contentModelDir(contentRoot), ASSOCIATIONS_FILENAME);
}

/** @deprecated Use relationshipsFilePath. */
export function connectionsFilePath(contentRoot: string): string {
  return relationshipsFilePath(contentRoot);
}

export function legacyConnectionsFilePath(contentRoot: string): string {
  return resolve(contentDataDir(contentRoot), CONNECTIONS_FILENAME);
}

export function dynamicPropertiesFilePath(contentRoot: string): string {
  return resolve(contentModelDir(contentRoot), DYNAMIC_PROPERTIES_FILENAME);
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

export function tablePresentationFilePath(contentRoot: string): string {
  return resolve(contentModelDir(contentRoot), TABLE_PRESENTATION_FILENAME);
}

export function extensionsFilePath(contentRoot: string): string {
  return resolve(contentModelDir(contentRoot), EXTENSIONS_FILENAME);
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
