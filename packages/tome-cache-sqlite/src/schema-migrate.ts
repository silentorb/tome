import type { Database } from "bun:sqlite";
import { SCHEMA_VERSION } from "./schema";

function tableExists(db: Database, name: string): boolean {
  const row = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name);
  return row != null;
}

/** Rename legacy `connections` table and indexes to `relationships` (schema v4 → v5). */
export function migrateSchemaToV5(db: Database): void {
  if (tableExists(db, "connections") && !tableExists(db, "relationships")) {
    db.exec("ALTER TABLE connections RENAME TO relationships");
    db.exec("DROP INDEX IF EXISTS idx_connections_source");
    db.exec("DROP INDEX IF EXISTS idx_connections_target");
    db.exec("DROP INDEX IF EXISTS idx_connections_label");
    db.exec("DROP INDEX IF EXISTS idx_connections_endpoint_label");
    db.exec("CREATE INDEX IF NOT EXISTS idx_relationships_source ON relationships(source_node_id)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_relationships_target ON relationships(target_node_id)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_relationships_label ON relationships(label)");
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_relationships_endpoint_label
      ON relationships(source_node_id, target_node_id, label)
    `);
  }
}

/** Drop legacy `node_labels` table (schema v5 → v6). */
export function migrateSchemaToV6(db: Database): void {
  if (tableExists(db, "node_labels")) {
    db.exec("DROP INDEX IF EXISTS idx_node_labels_label");
    db.exec("DROP TABLE node_labels");
  }
}

/** Replace directed `relationships` table with records + projections (schema v6 → v7). */
export function migrateSchemaToV7(db: Database): void {
  if (tableExists(db, "relationships") && !tableExists(db, "relationship_projections")) {
    db.exec("DROP INDEX IF EXISTS idx_relationships_source");
    db.exec("DROP INDEX IF EXISTS idx_relationships_target");
    db.exec("DROP INDEX IF EXISTS idx_relationships_label");
    db.exec("DROP INDEX IF EXISTS idx_relationships_endpoint_label");
    db.exec("DROP TABLE relationships");
  }
}

/** Add denormalized archive flag on nodes (schema v9 → v10). */
export function migrateSchemaToV10(db: Database): void {
  if (!tableExists(db, "nodes")) return;
  const columns = db.prepare("PRAGMA table_info(nodes)").all() as { name: string }[];
  if (!columns.some((column) => column.name === "is_archived")) {
    db.exec("ALTER TABLE nodes ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0");
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_nodes_is_archived ON nodes(is_archived) WHERE is_archived = 1",
    );
  }
}

export function migrateSchema(db: Database): void {
  migrateSchemaToV5(db);
  migrateSchemaToV6(db);
  migrateSchemaToV7(db);
  migrateSchemaToV10(db);

  const versionRow = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as
    | { value: string }
    | undefined;
  const version = versionRow ? Number.parseInt(versionRow.value, 10) : 0;

  if (version < SCHEMA_VERSION) {
    db.prepare(
      "INSERT INTO meta (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run(String(SCHEMA_VERSION));
  }
}

/** @deprecated Use migrateSchema */
export const migrateSchemaToLatest = migrateSchema;
