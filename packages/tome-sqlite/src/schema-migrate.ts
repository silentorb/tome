import type { Database } from "bun:sqlite";
import {
  PROMOTED_NODE_COLUMN_SET,
  PROMOTED_RELATIONSHIP_COLUMN_SET,
  SCHEMA_VERSION,
} from "./schema";

function tableExists(db: Database, name: string): boolean {
  const row = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name);
  return row != null;
}

function columnNames(db: Database, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
    (column) => column.name,
  );
}

function parseJsonObject(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw) as unknown;
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch {
    /* fall through */
  }
  return {};
}

function textColumn(value: unknown): string | null {
  return typeof value === "string" ? value : null;
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
  const columns = columnNames(db, "nodes");
  if (!columns.includes("is_archived")) {
    db.exec("ALTER TABLE nodes ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0");
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_nodes_is_archived ON nodes(is_archived) WHERE is_archived = 1",
    );
  }
}

/**
 * Expand `nodes.properties` JSON into promoted columns + `node_properties` EAV
 * (schema v11 → v12).
 */
export function migrateSchemaToV12(db: Database): void {
  if (!tableExists(db, "nodes")) return;
  const columns = columnNames(db, "nodes");
  if (!columns.includes("properties")) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS node_properties (
        node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        PRIMARY KEY (node_id, key)
      )
    `);
    db.exec("CREATE INDEX IF NOT EXISTS idx_node_properties_key ON node_properties(key)");
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_nodes_is_archived ON nodes(is_archived) WHERE is_archived = 1",
    );
    return;
  }

  const rows = db.prepare("SELECT id, properties, is_archived FROM nodes").all() as {
    id: string;
    properties: string;
    is_archived: number;
  }[];

  db.exec("PRAGMA foreign_keys = OFF");
  db.exec(`
    CREATE TABLE nodes_v12 (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT,
      alias TEXT,
      body TEXT,
      created_at TEXT,
      modified_at TEXT,
      is_archived INTEGER NOT NULL DEFAULT 0
    )
  `);
  db.exec(`
    CREATE TABLE node_properties_v12 (
      node_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (node_id, key)
    )
  `);

  const insertNode = db.prepare(
    `INSERT INTO nodes_v12 (id, title, alias, body, created_at, modified_at, is_archived)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertProp = db.prepare(
    "INSERT INTO node_properties_v12 (node_id, key, value) VALUES (?, ?, ?)",
  );

  const tx = db.transaction(() => {
    for (const row of rows) {
      const bag = parseJsonObject(row.properties);
      const title = textColumn(bag.title);
      const alias = textColumn(bag.alias);
      const body = textColumn(bag.body);
      const createdAt = textColumn(bag.created_at);
      const modifiedAt = textColumn(bag.modified_at);
      insertNode.run(
        row.id,
        title,
        alias,
        body,
        createdAt,
        modifiedAt,
        row.is_archived ? 1 : 0,
      );

      for (const [key, value] of Object.entries(bag)) {
        if (value === undefined) continue;
        if (PROMOTED_NODE_COLUMN_SET.has(key) && typeof value === "string") continue;
        insertProp.run(row.id, key, JSON.stringify(value));
      }
    }

    db.exec("DROP TABLE nodes");
    if (tableExists(db, "node_properties")) {
      db.exec("DROP TABLE node_properties");
    }
    db.exec("ALTER TABLE nodes_v12 RENAME TO nodes");
    db.exec("ALTER TABLE node_properties_v12 RENAME TO node_properties");
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_nodes_is_archived ON nodes(is_archived) WHERE is_archived = 1",
    );
    db.exec("CREATE INDEX IF NOT EXISTS idx_node_properties_key ON node_properties(key)");
  });
  tx();
  db.exec("PRAGMA foreign_keys = ON");
}

function splitRelationshipBag(bag: Record<string, unknown>): {
  ordinal: number | null;
  order: string | null;
  priority: number | null;
  eav: Array<[string, string]>;
} {
  let ordinal: number | null = null;
  let order: string | null = null;
  let priority: number | null = null;
  const eav: Array<[string, string]> = [];

  for (const [key, value] of Object.entries(bag)) {
    if (value === undefined) continue;
    if (key === "ordinal" && typeof value === "number" && Number.isFinite(value)) {
      ordinal = value;
      continue;
    }
    if (key === "order" && typeof value === "string") {
      order = value;
      continue;
    }
    if (key === "priority" && typeof value === "number" && Number.isFinite(value)) {
      priority = value;
      continue;
    }
    if (PROMOTED_RELATIONSHIP_COLUMN_SET.has(key)) {
      // Wrong runtime type for a promoted key — keep in EAV rather than drop.
      eav.push([key, JSON.stringify(value)]);
      continue;
    }
    eav.push([key, JSON.stringify(value)]);
  }

  return { ordinal, order, priority, eav };
}

/**
 * Expand relationship `properties` JSON into promoted columns + EAV
 * (schema v12 → v13).
 */
export function migrateSchemaToV13(db: Database): void {
  if (!tableExists(db, "relationship_records")) return;
  const recordColumns = columnNames(db, "relationship_records");
  if (!recordColumns.includes("properties")) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS relationship_record_properties (
        record_id TEXT NOT NULL REFERENCES relationship_records(id) ON DELETE CASCADE,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        PRIMARY KEY (record_id, key)
      )
    `);
    db.exec(`
      CREATE TABLE IF NOT EXISTS relationship_projection_properties (
        projection_id TEXT NOT NULL REFERENCES relationship_projections(id) ON DELETE CASCADE,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        PRIMARY KEY (projection_id, key)
      )
    `);
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_rel_record_properties_key ON relationship_record_properties(key)",
    );
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_rel_proj_properties_key ON relationship_projection_properties(key)",
    );
    return;
  }

  const records = db
    .prepare("SELECT id, node_a, node_b, composite_type, properties FROM relationship_records")
    .all() as {
    id: string;
    node_a: string;
    node_b: string;
    composite_type: string;
    properties: string;
  }[];
  const projections = db
    .prepare(
      "SELECT id, record_id, source_node_id, target_node_id, type, properties FROM relationship_projections",
    )
    .all() as {
    id: string;
    record_id: string;
    source_node_id: string;
    target_node_id: string;
    type: string;
    properties: string;
  }[];

  db.exec("PRAGMA foreign_keys = OFF");
  db.exec(`
    CREATE TABLE relationship_records_v13 (
      id TEXT PRIMARY KEY NOT NULL,
      node_a TEXT NOT NULL,
      node_b TEXT NOT NULL,
      composite_type TEXT NOT NULL,
      ordinal INTEGER,
      "order" TEXT,
      priority INTEGER,
      UNIQUE (node_a, node_b, composite_type)
    )
  `);
  db.exec(`
    CREATE TABLE relationship_projections_v13 (
      id TEXT PRIMARY KEY NOT NULL,
      record_id TEXT NOT NULL,
      source_node_id TEXT NOT NULL,
      target_node_id TEXT NOT NULL,
      type TEXT NOT NULL,
      ordinal INTEGER,
      "order" TEXT,
      priority INTEGER
    )
  `);
  db.exec(`
    CREATE TABLE relationship_record_properties_v13 (
      record_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (record_id, key)
    )
  `);
  db.exec(`
    CREATE TABLE relationship_projection_properties_v13 (
      projection_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (projection_id, key)
    )
  `);

  const insertRecord = db.prepare(
    `INSERT INTO relationship_records_v13 (id, node_a, node_b, composite_type, ordinal, "order", priority)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertRecordProp = db.prepare(
    "INSERT INTO relationship_record_properties_v13 (record_id, key, value) VALUES (?, ?, ?)",
  );
  const insertProjection = db.prepare(
    `INSERT INTO relationship_projections_v13 (id, record_id, source_node_id, target_node_id, type, ordinal, "order", priority)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertProjectionProp = db.prepare(
    "INSERT INTO relationship_projection_properties_v13 (projection_id, key, value) VALUES (?, ?, ?)",
  );

  const tx = db.transaction(() => {
    for (const row of records) {
      const split = splitRelationshipBag(parseJsonObject(row.properties));
      insertRecord.run(
        row.id,
        row.node_a,
        row.node_b,
        row.composite_type,
        split.ordinal,
        split.order,
        split.priority,
      );
      for (const [key, value] of split.eav) {
        insertRecordProp.run(row.id, key, value);
      }
    }

    for (const row of projections) {
      const split = splitRelationshipBag(parseJsonObject(row.properties));
      insertProjection.run(
        row.id,
        row.record_id,
        row.source_node_id,
        row.target_node_id,
        row.type,
        split.ordinal,
        split.order,
        split.priority,
      );
      for (const [key, value] of split.eav) {
        insertProjectionProp.run(row.id, key, value);
      }
    }

    db.exec("DROP TABLE relationship_projections");
    db.exec("DROP TABLE relationship_records");
    if (tableExists(db, "relationship_record_properties")) {
      db.exec("DROP TABLE relationship_record_properties");
    }
    if (tableExists(db, "relationship_projection_properties")) {
      db.exec("DROP TABLE relationship_projection_properties");
    }
    db.exec("ALTER TABLE relationship_records_v13 RENAME TO relationship_records");
    db.exec("ALTER TABLE relationship_projections_v13 RENAME TO relationship_projections");
    db.exec(
      "ALTER TABLE relationship_record_properties_v13 RENAME TO relationship_record_properties",
    );
    db.exec(
      "ALTER TABLE relationship_projection_properties_v13 RENAME TO relationship_projection_properties",
    );
    db.exec("CREATE INDEX IF NOT EXISTS idx_rel_records_node_a ON relationship_records(node_a)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_rel_records_node_b ON relationship_records(node_b)");
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_rel_proj_source ON relationship_projections(source_node_id, type)",
    );
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_rel_proj_target ON relationship_projections(target_node_id, type)",
    );
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_rel_record_properties_key ON relationship_record_properties(key)",
    );
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_rel_proj_properties_key ON relationship_projection_properties(key)",
    );
  });
  tx();
  db.exec("PRAGMA foreign_keys = ON");
}

export function migrateSchema(db: Database): void {
  migrateSchemaToV5(db);
  migrateSchemaToV6(db);
  migrateSchemaToV7(db);
  migrateSchemaToV10(db);
  migrateSchemaToV12(db);
  migrateSchemaToV13(db);
  migrateSchemaToV14(db);
  migrateSchemaToV15(db);

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

/** Expression index catalog + values for dyn / Imp sort keys (schema v13 → v14). */
export function migrateSchemaToV14(db: Database): void {
  if (tableExists(db, "expression_indexes")) return;
  db.exec(`
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
  `);
}

/** Dirty member tracking for incremental expression-index patches (v14 → v15). */
export function migrateSchemaToV15(db: Database): void {
  if (!tableExists(db, "expression_indexes")) return;
  if (columnNames(db, "expression_indexes").includes("dirty_member_ids")) return;
  db.exec(`ALTER TABLE expression_indexes ADD COLUMN dirty_member_ids TEXT`);
}

/** @deprecated Use migrateSchema */
export const migrateSchemaToLatest = migrateSchema;
