export const SCHEMA_VERSION = 10;

export const DDL = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY NOT NULL,
  properties TEXT NOT NULL DEFAULT '{}',
  is_archived INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS relationship_records (
  id TEXT PRIMARY KEY NOT NULL,
  node_a TEXT NOT NULL,
  node_b TEXT NOT NULL,
  composite_type TEXT NOT NULL,
  properties TEXT NOT NULL DEFAULT '{}',
  directed_from TEXT,
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

CREATE INDEX IF NOT EXISTS idx_rel_records_node_a ON relationship_records(node_a);
CREATE INDEX IF NOT EXISTS idx_rel_records_node_b ON relationship_records(node_b);
CREATE INDEX IF NOT EXISTS idx_rel_proj_source ON relationship_projections(source_node_id, type);
CREATE INDEX IF NOT EXISTS idx_rel_proj_target ON relationship_projections(target_node_id, type);
`;

/** @deprecated Dynamic field configuration lives in content/model/dynamic-fields.json (schema v4+). */
export const DYNAMIC_FIELDS_DDL = "";
