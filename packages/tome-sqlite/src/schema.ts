export const SCHEMA_VERSION = 16;

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

/** Hot relationship fields stored as real columns (never in relationship_*_properties EAV). */
export const PROMOTED_RELATIONSHIP_COLUMNS = ["ordinal", "order", "priority"] as const;

export type PromotedRelationshipColumn = (typeof PROMOTED_RELATIONSHIP_COLUMNS)[number];

export const PROMOTED_RELATIONSHIP_COLUMN_SET: ReadonlySet<string> = new Set(
  PROMOTED_RELATIONSHIP_COLUMNS,
);

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
  ordinal INTEGER,
  "order" TEXT,
  priority INTEGER,
  UNIQUE (node_a, node_b, composite_type)
);

CREATE TABLE IF NOT EXISTS relationship_projections (
  id TEXT PRIMARY KEY NOT NULL,
  record_id TEXT NOT NULL REFERENCES relationship_records(id) ON DELETE CASCADE,
  source_node_id TEXT NOT NULL,
  target_node_id TEXT NOT NULL,
  type TEXT NOT NULL,
  ordinal INTEGER,
  "order" TEXT,
  priority INTEGER
);

CREATE TABLE IF NOT EXISTS relationship_record_properties (
  record_id TEXT NOT NULL REFERENCES relationship_records(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (record_id, key)
);

CREATE TABLE IF NOT EXISTS relationship_projection_properties (
  projection_id TEXT NOT NULL REFERENCES relationship_projections(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (projection_id, key)
);

CREATE INDEX IF NOT EXISTS idx_nodes_is_archived ON nodes(is_archived) WHERE is_archived = 1;
CREATE INDEX IF NOT EXISTS idx_node_properties_key ON node_properties(key);
CREATE INDEX IF NOT EXISTS idx_rel_records_node_a ON relationship_records(node_a);
CREATE INDEX IF NOT EXISTS idx_rel_records_node_b ON relationship_records(node_b);
-- Fresh DDL uses the v13 two-column shape so CREATE INDEX IF NOT EXISTS is safe on
-- pre-ordinal upgrade DBs; migrateSchemaToV16 widens to (source_node_id, type, ordinal, id).
CREATE INDEX IF NOT EXISTS idx_rel_proj_source ON relationship_projections(source_node_id, type);
CREATE INDEX IF NOT EXISTS idx_rel_proj_target ON relationship_projections(target_node_id, type);
CREATE INDEX IF NOT EXISTS idx_rel_record_properties_key ON relationship_record_properties(key);
CREATE INDEX IF NOT EXISTS idx_rel_proj_properties_key ON relationship_projection_properties(key);

CREATE TABLE IF NOT EXISTS expression_indexes (
  digest TEXT PRIMARY KEY NOT NULL,
  status TEXT NOT NULL,
  built_at TEXT,
  expression_json TEXT NOT NULL DEFAULT '{}',
  dirty_member_ids TEXT
);

CREATE TABLE IF NOT EXISTS expression_index_values (
  digest TEXT NOT NULL REFERENCES expression_indexes(digest) ON DELETE CASCADE,
  member_id TEXT NOT NULL,
  sort_value REAL NOT NULL,
  PRIMARY KEY (digest, member_id)
);

CREATE INDEX IF NOT EXISTS idx_expression_index_sort
  ON expression_index_values(digest, sort_value);
`;

/** @deprecated Dynamic property configuration lives in content/model/dynamic-properties.json (schema v4+). */
export const DYNAMIC_PROPERTIES_DDL = "";
