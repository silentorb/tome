export const SCHEMA_VERSION = 12;

/** Hot node fields stored as real columns on `nodes` (never in `node_properties`). */
export const PROMOTED_NODE_COLUMNS = [
  "title",
  "alias",
  "body",
  "created_at",
  "modified_at",
] as const;

export type PromotedNodeColumn = (typeof PROMOTED_NODE_COLUMNS)[number];

export const PROMOTED_NODE_COLUMN_SET: ReadonlySet<string> = new Set(PROMOTED_NODE_COLUMNS);

export const DDL = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT,
  alias TEXT,
  body TEXT,
  created_at TEXT,
  modified_at TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS node_properties (
  node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (node_id, key)
);

CREATE TABLE IF NOT EXISTS relationship_records (
  id TEXT PRIMARY KEY NOT NULL,
  node_a TEXT NOT NULL,
  node_b TEXT NOT NULL,
  composite_type TEXT NOT NULL,
  properties TEXT NOT NULL DEFAULT '{}',
  UNIQUE (node_a, node_b, composite_type)
);

CREATE TABLE IF NOT EXISTS relationship_projections (
  id TEXT PRIMARY KEY NOT NULL,
  record_id TEXT NOT NULL REFERENCES relationship_records(id) ON DELETE CASCADE,
  source_node_id TEXT NOT NULL,
  target_node_id TEXT NOT NULL,
  type TEXT NOT NULL,
  properties TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_nodes_is_archived ON nodes(is_archived) WHERE is_archived = 1;
CREATE INDEX IF NOT EXISTS idx_node_properties_key ON node_properties(key);
CREATE INDEX IF NOT EXISTS idx_rel_records_node_a ON relationship_records(node_a);
CREATE INDEX IF NOT EXISTS idx_rel_records_node_b ON relationship_records(node_b);
CREATE INDEX IF NOT EXISTS idx_rel_proj_source ON relationship_projections(source_node_id, type);
CREATE INDEX IF NOT EXISTS idx_rel_proj_target ON relationship_projections(target_node_id, type);
`;

/** @deprecated Dynamic property configuration lives in content/model/dynamic-properties.json (schema v4+). */
export const DYNAMIC_PROPERTIES_DDL = "";
