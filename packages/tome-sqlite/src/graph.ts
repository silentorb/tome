import { Database, type SQLQueryBindings } from "bun:sqlite";
import { mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import type { Node, Properties, PropertyValue, Relationship } from "tome-graph-interfaces";
import type {
  GraphCounts,
  RelationshipProjectionRow,
  RelationshipProjectionWindowQuery,
  RelationshipProjectionWindowResult,
  RelationshipPropertyCodec,
  RelationshipRecordRow,
  MemberPageQuery,
  MemberPageResult,
  DistinctSetMemberScopeQuery,
  DistinctSetMemberScopeRow,
  ComposedGroupHeadersQuery,
  ComposedGroupHeaderRow,
  TomeQueryCache,
} from "tome-service-interfaces";
import {
  instrumentSqliteDatabaseForProfiling,
  isProfilingEnabled,
  withProfilingSpan,
} from "tome-service-interfaces";
import { migrateSchema } from "./schema-migrate";
import {
  DDL,
  PROMOTED_NODE_COLUMN_SET,
  PROMOTED_RELATIONSHIP_COLUMN_SET,
  SCHEMA_VERSION,
} from "./schema";
import {
  buildMembershipCte,
  compileMemberPage,
  relationFieldsByRowFromSqlRows,
} from "./membership-query";

export type {
  Node,
  Properties,
  PropertyValue,
  Relationship,
} from "tome-graph-interfaces";

export type { GraphCounts } from "tome-service-interfaces";

const IDENTITY_CODEC: RelationshipPropertyCodec = {
  encode: (properties) => properties,
  decode: (properties) => properties,
};

const NODE_DISPLAY_TITLE_SQL = `COALESCE(NULLIF(title, ''), NULLIF(alias, ''), 'Untitled')`;
const TARGET_DISPLAY_TITLE_SQL = `COALESCE(NULLIF(n.title, ''), NULLIF(n.alias, ''), 'Untitled')`;

function isSafeSqlPropertyKey(key: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key);
}

function edgePropertyOrderExpression(propertyKey: string): string {
  if (propertyKey === "ordinal") return "rp.ordinal";
  if (propertyKey === "order") return `rp."order"`;
  if (propertyKey === "priority") return "rp.priority";
  // EAV values are JSON-encoded; extract scalar for ordering.
  return `(SELECT json_extract(value, '$') FROM relationship_projection_properties WHERE projection_id = rp.id AND key = '${propertyKey}')`;
}


function buildOutgoingProjectionOrderBy(
  sorts: readonly { column: string; direction: "asc" | "desc" }[] | undefined,
): string {
  const clauses: string[] = [];
  if (sorts && sorts.length > 0) {
    for (const sort of sorts) {
      const dir = sort.direction === "desc" ? "DESC" : "ASC";
      const col = sort.column.trim();
      if (!col || !isSafeSqlPropertyKey(col)) continue;
      if (col === "name") {
        clauses.push(`${TARGET_DISPLAY_TITLE_SQL} COLLATE NOCASE ${dir}`);
      } else {
        clauses.push(`${edgePropertyOrderExpression(col)} ${dir}`);
      }
    }
  }
  if (clauses.length === 0) {
    // Default: ordinal ascending (nulls last), then target display title.
    clauses.push("CASE WHEN rp.ordinal IS NULL THEN 1 ELSE 0 END ASC");
    clauses.push("rp.ordinal ASC");
    clauses.push(`${TARGET_DISPLAY_TITLE_SQL} COLLATE NOCASE ASC`);
  } else {
    // Stable tie-break.
    clauses.push(`${TARGET_DISPLAY_TITLE_SQL} COLLATE NOCASE ASC`);
    clauses.push("rp.id ASC");
  }
  return `ORDER BY ${clauses.join(", ")}`;
}

function decodePropertyValue(raw: string): PropertyValue {
  try {
    return JSON.parse(raw) as PropertyValue;
  } catch {
    return raw;
  }
}

function mergeProperties(base: Properties, patch: Properties): Properties {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}

type NodeRow = {
  id: string;
  title: string | null;
  alias: string | null;
  body: string | null;
  created_at: string | null;
  modified_at: string | null;
};

function splitNodeProperties(properties: Properties): {
  title: string | null;
  alias: string | null;
  body: string | null;
  created_at: string | null;
  modified_at: string | null;
  eav: Properties;
} {
  const eav: Properties = {};
  let title: string | null = null;
  let alias: string | null = null;
  let body: string | null = null;
  let created_at: string | null = null;
  let modified_at: string | null = null;

  for (const [key, value] of Object.entries(properties)) {
    if (value === undefined) continue;
    if (key === "title" && typeof value === "string") {
      title = value;
      continue;
    }
    if (key === "alias" && typeof value === "string") {
      alias = value;
      continue;
    }
    if (key === "body" && typeof value === "string") {
      body = value;
      continue;
    }
    if (key === "created_at" && typeof value === "string") {
      created_at = value;
      continue;
    }
    if (key === "modified_at" && typeof value === "string") {
      modified_at = value;
      continue;
    }
    if (PROMOTED_NODE_COLUMN_SET.has(key) && typeof value === "string") {
      continue;
    }
    eav[key] = value;
  }

  return { title, alias, body, created_at, modified_at, eav };
}

function assembleNodeProperties(
  row: NodeRow,
  eavRows: readonly { key: string; value: string }[],
): Properties {
  const properties: Properties = {};
  if (row.title != null) properties.title = row.title;
  if (row.alias != null) properties.alias = row.alias;
  if (row.body != null) properties.body = row.body;
  if (row.created_at != null) properties.created_at = row.created_at;
  if (row.modified_at != null) properties.modified_at = row.modified_at;
  for (const entry of eavRows) {
    properties[entry.key] = decodePropertyValue(entry.value);
  }
  return properties;
}

type RelationshipColumns = {
  ordinal: number | null;
  order: string | null;
  priority: number | null;
};

type ProjectionRow = {
  id: string;
  record_id: string;
  source_node_id: string;
  target_node_id: string;
  type: string;
  ordinal: number | null;
  order: string | null;
  priority: number | null;
};

type RecordRow = {
  id: string;
  node_a: string;
  node_b: string;
  composite_type: string;
  ordinal: number | null;
  order: string | null;
  priority: number | null;
};

function splitRelationshipProperties(properties: Properties): {
  ordinal: number | null;
  order: string | null;
  priority: number | null;
  eav: Properties;
} {
  const eav: Properties = {};
  let ordinal: number | null = null;
  let order: string | null = null;
  let priority: number | null = null;

  for (const [key, value] of Object.entries(properties)) {
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
      eav[key] = value;
      continue;
    }
    eav[key] = value;
  }

  return { ordinal, order, priority, eav };
}

function assembleRelationshipProperties(
  columns: RelationshipColumns,
  eavRows: readonly { key: string; value: string }[],
): Properties {
  const properties: Properties = {};
  if (columns.ordinal != null) properties.ordinal = columns.ordinal;
  if (columns.order != null) properties.order = columns.order;
  if (columns.priority != null) properties.priority = columns.priority;
  for (const entry of eavRows) {
    properties[entry.key] = decodePropertyValue(entry.value);
  }
  return properties;
}

export function relationshipId(sourceNodeId: string, type: string, targetNodeId: string): string {
  return `${sourceNodeId}:${type}:${targetNodeId}`;
}

export class GraphDatabase implements TomeQueryCache {
  readonly path: string;
  private db: Database;
  private readonly propertyCodec: RelationshipPropertyCodec;
  private readonly memberPerspectives?: () => readonly string[];

  private insertNodeId!: ReturnType<Database["prepare"]>;
  private updateNodeColumns!: ReturnType<Database["prepare"]>;
  private deleteNodeProperties!: ReturnType<Database["prepare"]>;
  private insertNodeProperty!: ReturnType<Database["prepare"]>;
  private selectNodeRow!: ReturnType<Database["prepare"]>;
  private selectNodeProperties!: ReturnType<Database["prepare"]>;
  private insertRecord!: ReturnType<Database["prepare"]>;
  private updateRecordColumns!: ReturnType<Database["prepare"]>;
  private deleteRecordProperties!: ReturnType<Database["prepare"]>;
  private insertRecordProperty!: ReturnType<Database["prepare"]>;
  private selectRecordRow!: ReturnType<Database["prepare"]>;
  private selectRecordProperties!: ReturnType<Database["prepare"]>;
  private insertProjection!: ReturnType<Database["prepare"]>;
  private updateProjectionColumns!: ReturnType<Database["prepare"]>;
  private deleteProjectionProperties!: ReturnType<Database["prepare"]>;
  private insertProjectionProperty!: ReturnType<Database["prepare"]>;
  private selectProjectionRow!: ReturnType<Database["prepare"]>;
  private selectProjectionProperties!: ReturnType<Database["prepare"]>;

  constructor(
    path: string,
    options?: {
      clean?: boolean;
      propertyCodec?: RelationshipPropertyCodec;
      memberPerspectives?: () => readonly string[];
    },
  ) {
    this.path = path;
    this.propertyCodec = options?.propertyCodec ?? IDENTITY_CODEC;
    this.memberPerspectives = options?.memberPerspectives;
    if (options?.clean) {
      try {
        rmSync(path, { force: true });
      } catch {
        /* missing file */
      }
    }
    mkdirSync(dirname(path), { recursive: true });
    this.db = instrumentSqliteDatabaseForProfiling(new Database(path, { create: true }));
    this.db.exec("PRAGMA foreign_keys = ON");
    this.db.exec("PRAGMA journal_mode = DELETE");
    this.db.exec(DDL);
    migrateSchema(this.db);
    this.prepareStatements();
    this.setMeta("schema_version", String(SCHEMA_VERSION));
  }

  private writeRecordProperties(id: string, encoded: Properties): void {
    const split = splitRelationshipProperties(encoded);
    this.updateRecordColumns.run(split.ordinal, split.order, split.priority, id);
    this.deleteRecordProperties.run(id);
    for (const [key, value] of Object.entries(split.eav)) {
      if (value === undefined) continue;
      this.insertRecordProperty.run(id, key, JSON.stringify(value));
    }
  }

  private writeProjectionProperties(id: string, encoded: Properties): void {
    const split = splitRelationshipProperties(encoded);
    this.updateProjectionColumns.run(split.ordinal, split.order, split.priority, id);
    this.deleteProjectionProperties.run(id);
    for (const [key, value] of Object.entries(split.eav)) {
      if (value === undefined) continue;
      this.insertProjectionProperty.run(id, key, JSON.stringify(value));
    }
  }

  private mapProjectionRow(
    row: ProjectionRow,
    eavRows: readonly { key: string; value: string }[],
  ): Relationship {
    return {
      id: row.id,
      recordId: row.record_id,
      sourceNodeId: row.source_node_id,
      targetNodeId: row.target_node_id,
      type: row.type,
      properties: this.propertyCodec.decode(
        assembleRelationshipProperties(
          { ordinal: row.ordinal, order: row.order, priority: row.priority },
          eavRows,
        ),
      ),
    };
  }

  private mapProjectionRows(rows: ProjectionRow[]): Relationship[] {
    if (rows.length === 0) return [];
    const placeholders = rows.map(() => "?").join(", ");
    const eavAll = this.db
      .prepare(
        `SELECT projection_id, key, value FROM relationship_projection_properties
         WHERE projection_id IN (${placeholders})`,
      )
      .all(...rows.map((row) => row.id)) as {
      projection_id: string;
      key: string;
      value: string;
    }[];
    const eavById = new Map<string, { key: string; value: string }[]>();
    for (const entry of eavAll) {
      const list = eavById.get(entry.projection_id);
      if (list) list.push(entry);
      else eavById.set(entry.projection_id, [entry]);
    }
    return rows.map((row) => this.mapProjectionRow(row, eavById.get(row.id) ?? []));
  }

  private prepareStatements(): void {
    this.insertNodeId = this.db.prepare(
      "INSERT INTO nodes (id, is_archived) VALUES (?, 0) ON CONFLICT(id) DO NOTHING",
    );
    this.updateNodeColumns = this.db.prepare(
      `UPDATE nodes
       SET title = ?, alias = ?, body = ?, created_at = ?, modified_at = ?
       WHERE id = ?`,
    );
    this.deleteNodeProperties = this.db.prepare(
      "DELETE FROM node_properties WHERE node_id = ?",
    );
    this.insertNodeProperty = this.db.prepare(
      "INSERT INTO node_properties (node_id, key, value) VALUES (?, ?, ?)",
    );
    this.selectNodeRow = this.db.prepare(
      `SELECT id, title, alias, body, created_at, modified_at
       FROM nodes WHERE id = ?`,
    );
    this.selectNodeProperties = this.db.prepare(
      "SELECT key, value FROM node_properties WHERE node_id = ?",
    );
    this.insertRecord = this.db.prepare(
      `INSERT INTO relationship_records (id, node_a, node_b, composite_type)
       VALUES (?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`,
    );
    this.updateRecordColumns = this.db.prepare(
      `UPDATE relationship_records SET ordinal = ?, "order" = ?, priority = ? WHERE id = ?`,
    );
    this.deleteRecordProperties = this.db.prepare(
      "DELETE FROM relationship_record_properties WHERE record_id = ?",
    );
    this.insertRecordProperty = this.db.prepare(
      "INSERT INTO relationship_record_properties (record_id, key, value) VALUES (?, ?, ?)",
    );
    this.selectRecordRow = this.db.prepare(
      `SELECT id, node_a, node_b, composite_type, ordinal, "order", priority
       FROM relationship_records WHERE id = ?`,
    );
    this.selectRecordProperties = this.db.prepare(
      "SELECT key, value FROM relationship_record_properties WHERE record_id = ?",
    );
    this.insertProjection = this.db.prepare(
      `INSERT INTO relationship_projections (id, record_id, source_node_id, target_node_id, type)
       VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`,
    );
    this.updateProjectionColumns = this.db.prepare(
      `UPDATE relationship_projections SET ordinal = ?, "order" = ?, priority = ? WHERE id = ?`,
    );
    this.deleteProjectionProperties = this.db.prepare(
      "DELETE FROM relationship_projection_properties WHERE projection_id = ?",
    );
    this.insertProjectionProperty = this.db.prepare(
      "INSERT INTO relationship_projection_properties (projection_id, key, value) VALUES (?, ?, ?)",
    );
    this.selectProjectionRow = this.db.prepare(
      `SELECT id, record_id, source_node_id, target_node_id, type, ordinal, "order", priority
       FROM relationship_projections WHERE id = ?`,
    );
    this.selectProjectionProperties = this.db.prepare(
      "SELECT key, value FROM relationship_projection_properties WHERE projection_id = ?",
    );
  }

  setMeta(key: string, value: string): void {
    this.db
      .prepare(
        "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(key, value);
  }

  getMeta(key: string): string | null {
    const row = this.db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  private writeNodeProperties(id: string, properties: Properties): void {
    const split = splitNodeProperties(properties);
    this.updateNodeColumns.run(
      split.title,
      split.alias,
      split.body,
      split.created_at,
      split.modified_at,
      id,
    );
    this.deleteNodeProperties.run(id);
    for (const [key, value] of Object.entries(split.eav)) {
      if (value === undefined) continue;
      this.insertNodeProperty.run(id, key, JSON.stringify(value));
    }
  }

  upsertNode(id: string, properties: Properties = {}): void {
    this.insertNodeId.run(id);
    const existing = this.getNode(id);
    if (!existing) return;
    if (Object.keys(properties).length === 0) return;
    const merged = mergeProperties(existing.properties, properties);
    this.writeNodeProperties(id, merged);
  }

  mergeNodeProperties(id: string, properties: Properties): void {
    const existing = this.getNode(id);
    if (!existing) {
      this.upsertNode(id, properties);
      return;
    }
    const merged = mergeProperties(existing.properties, properties);
    this.writeNodeProperties(id, merged);
  }

  clearRelationshipCache(): void {
    this.db.exec("DELETE FROM relationship_projections");
    this.db.exec("DELETE FROM relationship_records");
    this.markExpressionIndexesStale();
  }

  upsertRelationshipRecord(record: RelationshipRecordRow): void {
    this.insertRecord.run(record.id, record.nodeA, record.nodeB, record.compositeType);
    if (Object.keys(record.properties).length === 0) {
      this.markExpressionIndexesStaleForTypes(
        [record.compositeType],
        [record.nodeA, record.nodeB],
      );
      return;
    }
    const existing = this.getRelationshipRecord(record.id);
    if (!existing) {
      this.markExpressionIndexesStaleForTypes(
        [record.compositeType],
        [record.nodeA, record.nodeB],
      );
      return;
    }
    const merged = mergeProperties(existing.properties, record.properties);
    this.writeRecordProperties(record.id, this.propertyCodec.encode(merged));
    this.markExpressionIndexesStaleForTypes(
      [record.compositeType],
      [record.nodeA, record.nodeB],
    );
  }

  upsertRelationshipProjection(projection: RelationshipProjectionRow): void {
    this.insertProjection.run(
      projection.id,
      projection.recordId,
      projection.sourceNodeId,
      projection.targetNodeId,
      projection.type,
    );
    if (Object.keys(projection.properties).length === 0) {
      this.markExpressionIndexesStaleForTypes(
        [projection.type],
        [projection.sourceNodeId, projection.targetNodeId],
      );
      return;
    }
    const existing = this.getRelationship(projection.id);
    if (!existing) {
      this.markExpressionIndexesStaleForTypes(
        [projection.type],
        [projection.sourceNodeId, projection.targetNodeId],
      );
      return;
    }
    const merged = mergeProperties(existing.properties, projection.properties);
    this.writeProjectionProperties(projection.id, this.propertyCodec.encode(merged));
    this.markExpressionIndexesStaleForTypes(
      [projection.type],
      [projection.sourceNodeId, projection.targetNodeId],
    );
  }

  /** @deprecated Use upsertRelationshipProjection via sync expander. Kept for test helpers. */
  upsertRelationship(
    sourceNodeId: string,
    targetNodeId: string,
    type: string,
    properties: Properties = {},
  ): void {
    const id = relationshipId(sourceNodeId, type, targetNodeId);
    this.insertRecord.run(id, sourceNodeId, targetNodeId, type);
    this.insertProjection.run(id, id, sourceNodeId, targetNodeId, type);
    if (Object.keys(properties).length === 0) {
      this.markExpressionIndexesStaleForTypes([type], [sourceNodeId, targetNodeId]);
      return;
    }
    const existing = this.getRelationship(id);
    if (!existing) {
      this.markExpressionIndexesStaleForTypes([type], [sourceNodeId, targetNodeId]);
      return;
    }
    const merged = mergeProperties(existing.properties, properties);
    const encoded = this.propertyCodec.encode(merged);
    this.writeRecordProperties(id, encoded);
    this.writeProjectionProperties(id, encoded);
    this.markExpressionIndexesStaleForTypes([type], [sourceNodeId, targetNodeId]);
  }

  mergeRelationshipProperties(id: string, properties: Properties): void {
    const existing = this.getRelationship(id);
    if (!existing) return;
    const merged = mergeProperties(existing.properties, properties);
    const encoded = this.propertyCodec.encode(merged);
    this.writeProjectionProperties(id, encoded);
    if (existing.recordId) {
      this.writeRecordProperties(existing.recordId, encoded);
    }
    this.markExpressionIndexesStaleForTypes(
      [existing.type],
      [existing.sourceNodeId, existing.targetNodeId],
    );
  }

  deleteRelationship(sourceNodeId: string, targetNodeId: string, type: string): boolean {
    const id = relationshipId(sourceNodeId, type, targetNodeId);
    const row = this.getRelationship(id);
    if (!row?.recordId) {
      const result = this.db
        .prepare("DELETE FROM relationship_projections WHERE id = ?")
        .run(id);
      if (result.changes > 0) {
        this.markExpressionIndexesStaleForTypes([type], [sourceNodeId, targetNodeId]);
      }
      return result.changes > 0;
    }
    const result = this.db
      .prepare("DELETE FROM relationship_records WHERE id = ?")
      .run(row.recordId);
    if (result.changes > 0) {
      this.markExpressionIndexesStaleForTypes([type], [sourceNodeId, targetNodeId]);
    }
    return result.changes > 0;
  }

  deleteNode(id: string): boolean {
    const result = this.db.prepare("DELETE FROM nodes WHERE id = ?").run(id);
    if (result.changes > 0) this.markExpressionIndexesStale();
    return result.changes > 0;
  }

  getNode(id: string): Node | null {
    const row = this.selectNodeRow.get(id) as NodeRow | undefined;
    if (!row) return null;
    const eavRows = this.selectNodeProperties.all(id) as { key: string; value: string }[];
    return {
      id: row.id,
      properties: assembleNodeProperties(row, eavRows),
    };
  }

  isNodeArchived(id: string): boolean {
    const row = this.db
      .prepare("SELECT is_archived FROM nodes WHERE id = ?")
      .get(id) as { is_archived: number } | undefined;
    return row?.is_archived === 1;
  }

  listArchiveMemberIds(archiveId: string, memberPerspectives?: readonly string[]): string[] {
    const types = [...(memberPerspectives ?? this.memberPerspectives?.() ?? [])];
    if (types.length === 0) return [];
    const placeholders = types.map(() => "?").join(", ");
    const rows = this.db
      .prepare(
        `SELECT DISTINCT
           CASE WHEN source_node_id = ?1 THEN target_node_id ELSE source_node_id END AS member_id
         FROM relationship_projections
         WHERE type IN (${placeholders})
           AND (source_node_id = ?1 OR target_node_id = ?1)
           AND source_node_id != target_node_id`,
      )
      .all(archiveId, ...types) as { member_id: string }[];
    return rows.map((row) => row.member_id);
  }

  /** @deprecated Use listArchiveMemberIds */
  listIncludesArchiveMemberIds(
    archiveId: string,
    memberPerspectives?: readonly string[],
  ): string[] {
    return this.listArchiveMemberIds(archiveId, memberPerspectives);
  }

  recomputeArchivedFlags(
    archiveId: string | readonly string[],
    memberPerspectives?: readonly string[],
  ): void {
    this.db.exec("UPDATE nodes SET is_archived = 0");
    const hubs = typeof archiveId === "string" ? [archiveId] : [...archiveId];
    const memberIds = new Set<string>();
    for (const hub of hubs) {
      for (const id of this.listArchiveMemberIds(hub, memberPerspectives)) {
        memberIds.add(id);
      }
    }
    if (memberIds.size === 0) return;
    const ids = [...memberIds];
    const placeholders = ids.map(() => "?").join(", ");
    this.db
      .prepare(`UPDATE nodes SET is_archived = 1 WHERE id IN (${placeholders})`)
      .run(...ids);
  }

  getRelationshipRecord(id: string): RelationshipRecordRow | null {
    const row = this.selectRecordRow.get(id) as RecordRow | undefined;
    if (!row) return null;
    const eavRows = this.selectRecordProperties.all(id) as { key: string; value: string }[];
    return {
      id: row.id,
      nodeA: row.node_a,
      nodeB: row.node_b,
      compositeType: row.composite_type,
      properties: this.propertyCodec.decode(
        assembleRelationshipProperties(
          { ordinal: row.ordinal, order: row.order, priority: row.priority },
          eavRows,
        ),
      ),
    };
  }

  getRelationship(id: string): Relationship | null {
    const row = this.selectProjectionRow.get(id) as ProjectionRow | undefined;
    if (!row) return null;
    const eavRows = this.selectProjectionProperties.all(id) as { key: string; value: string }[];
    return this.mapProjectionRow(row, eavRows);
  }

  counts(): GraphCounts {
    const n = this.db.prepare("SELECT COUNT(*) AS c FROM nodes").get() as { c: number };
    const r = this.db
      .prepare("SELECT COUNT(*) AS c FROM relationship_projections")
      .get() as { c: number };
    return { nodes: n.c, relationships: r.c };
  }

  searchNodesByTitle(
    pattern: string,
    limit: number,
    allowedTypeIds?: readonly string[],
    allowedNodeIds?: ReadonlySet<string>,
  ): { id: string; title: string }[] {
    if (allowedNodeIds && allowedNodeIds.size === 0) return [];
    const filter = this.buildSearchFilterSql(allowedTypeIds, allowedNodeIds);
    return this.db
      .prepare(
        `SELECT id, ${NODE_DISPLAY_TITLE_SQL} AS title
         FROM nodes
         WHERE is_archived = 0
           AND COALESCE(title, alias, '') LIKE ? ESCAPE '\\'
           ${filter.sql}
         ORDER BY title COLLATE NOCASE
         LIMIT ?`,
      )
      .all(pattern, ...filter.params, limit) as { id: string; title: string }[];
  }

  searchNodesByBody(
    pattern: string,
    limit: number,
    allowedTypeIds?: readonly string[],
    allowedNodeIds?: ReadonlySet<string>,
  ): { id: string; title: string }[] {
    if (allowedNodeIds && allowedNodeIds.size === 0) return [];
    const filter = this.buildSearchFilterSql(allowedTypeIds, allowedNodeIds);
    return this.db
      .prepare(
        `SELECT id, ${NODE_DISPLAY_TITLE_SQL} AS title
         FROM nodes
         WHERE is_archived = 0
           AND COALESCE(body, '') LIKE ? ESCAPE '\\'
           ${filter.sql}
         ORDER BY title COLLATE NOCASE
         LIMIT ?`,
      )
      .all(pattern, ...filter.params, limit) as { id: string; title: string }[];
  }

  searchNodesLikeWindow(
    pattern: string,
    options: {
      offset?: number;
      limit?: number | null;
      allowedTypeIds?: readonly string[];
      allowedNodeIds?: ReadonlySet<string>;
    },
  ): { rows: { id: string; title: string }[]; total: number } {
    const allowedNodeIds = options.allowedNodeIds;
    if (allowedNodeIds && allowedNodeIds.size === 0) {
      return { rows: [], total: 0 };
    }

    const offsetRaw = options.offset;
    const offset =
      typeof offsetRaw === "number" && Number.isFinite(offsetRaw) && offsetRaw > 0
        ? Math.floor(offsetRaw)
        : 0;
    const limitRaw = options.limit;
    const limit =
      limitRaw === undefined || limitRaw === null
        ? null
        : typeof limitRaw === "number" && Number.isFinite(limitRaw) && limitRaw > 0
          ? Math.floor(limitRaw)
          : null;

    const filter = this.buildSearchFilterSql(options.allowedTypeIds, allowedNodeIds);
    const combinedSql = `
      WITH title_hits AS (
        SELECT id, ${NODE_DISPLAY_TITLE_SQL} AS title, 0 AS phase
        FROM nodes
        WHERE is_archived = 0
          AND COALESCE(title, alias, '') LIKE ? ESCAPE '\\'
          ${filter.sql}
      ),
      body_hits AS (
        SELECT id, ${NODE_DISPLAY_TITLE_SQL} AS title, 1 AS phase
        FROM nodes
        WHERE is_archived = 0
          AND COALESCE(body, '') LIKE ? ESCAPE '\\'
          ${filter.sql}
          AND id NOT IN (SELECT id FROM title_hits)
      ),
      combined AS (
        SELECT id, title, phase FROM title_hits
        UNION ALL
        SELECT id, title, phase FROM body_hits
      )
    `;
    const baseParams: Array<string | number> = [
      pattern,
      ...filter.params,
      pattern,
      ...filter.params,
    ];

    const countRow = this.db
      .prepare(`${combinedSql} SELECT COUNT(*) AS c FROM combined`)
      .get(...baseParams) as { c: number };
    const total = countRow.c;
    if (total === 0 || offset >= total) {
      return { rows: [], total };
    }

    let rows: { id: string; title: string }[];
    if (limit === null) {
      if (offset === 0) {
        rows = this.db
          .prepare(
            `${combinedSql}
             SELECT id, title FROM combined
             ORDER BY phase ASC, title COLLATE NOCASE`,
          )
          .all(...baseParams) as { id: string; title: string }[];
      } else {
        rows = this.db
          .prepare(
            `${combinedSql}
             SELECT id, title FROM combined
             ORDER BY phase ASC, title COLLATE NOCASE
             LIMIT -1 OFFSET ?`,
          )
          .all(...baseParams, offset) as { id: string; title: string }[];
      }
    } else {
      rows = this.db
        .prepare(
          `${combinedSql}
           SELECT id, title FROM combined
           ORDER BY phase ASC, title COLLATE NOCASE
           LIMIT ? OFFSET ?`,
        )
        .all(...baseParams, limit, offset) as { id: string; title: string }[];
    }
    return { rows, total };
  }

  listNodesByTitle(
    limit: number,
    allowedTypeIds?: readonly string[],
    allowedNodeIds?: ReadonlySet<string>,
  ): { id: string; title: string }[] {
    if (allowedNodeIds && allowedNodeIds.size === 0) return [];
    const filter = this.buildSearchFilterSql(allowedTypeIds, allowedNodeIds);
    return this.db
      .prepare(
        `SELECT id, ${NODE_DISPLAY_TITLE_SQL} AS title
         FROM nodes
         WHERE is_archived = 0
           AND (title IS NOT NULL OR alias IS NOT NULL)
           ${filter.sql}
         ORDER BY title COLLATE NOCASE
         LIMIT ?`,
      )
      .all(...filter.params, limit) as { id: string; title: string }[];
  }

  listNodesByModifiedAt(
    limit: number,
    allowedTypeIds?: readonly string[],
  ): { id: string; title: string }[] {
    const rows = this.db
      .prepare(
        `SELECT id, ${NODE_DISPLAY_TITLE_SQL} AS title
         FROM nodes
         WHERE is_archived = 0
           AND (title IS NOT NULL OR alias IS NOT NULL)
           AND NULLIF(modified_at, '') IS NOT NULL
         ORDER BY modified_at DESC, id
         LIMIT ?`,
      )
      .all(limit) as { id: string; title: string }[];

    if (!allowedTypeIds || allowedTypeIds.length === 0) return rows;

    return rows.filter((row) => this.nodeMatchesAnyAllowedType(row.id, allowedTypeIds));
  }

  private nodeMatchesAnyAllowedType(
    nodeId: string,
    allowedTypeIds: readonly string[],
  ): boolean {
    const types = this.memberPerspectives?.() ?? [];
    for (const type of types) {
      for (const connection of this.listRelationshipsFromSource(nodeId, type)) {
        if (allowedTypeIds.includes(connection.targetNodeId)) return true;
      }
    }
    return false;
  }

  /**
   * SQL predicates for search/list filters.
   * - allowedNodeIds → `AND id IN (...)`
   * - allowedTypeIds → EXISTS over relationship_projections using member perspectives
   */
  private buildSearchFilterSql(
    allowedTypeIds: readonly string[] | undefined,
    allowedNodeIds: ReadonlySet<string> | undefined,
  ): { sql: string; params: Array<string | number> } {
    const parts: string[] = [];
    const params: Array<string | number> = [];

    if (allowedNodeIds && allowedNodeIds.size > 0) {
      const ids = [...allowedNodeIds];
      parts.push(`AND id IN (${ids.map(() => "?").join(", ")})`);
      params.push(...ids);
    }

    if (allowedTypeIds && allowedTypeIds.length > 0) {
      const perspectives = this.memberPerspectives?.() ?? [];
      if (perspectives.length === 0) {
        parts.push("AND 0");
      } else {
        const typePlaceholders = allowedTypeIds.map(() => "?").join(", ");
        const perspectivePlaceholders = perspectives.map(() => "?").join(", ");
        parts.push(`AND EXISTS (
          SELECT 1 FROM relationship_projections rp
          WHERE rp.source_node_id = nodes.id
            AND rp.type IN (${perspectivePlaceholders})
            AND rp.target_node_id IN (${typePlaceholders})
        )`);
        params.push(...perspectives, ...allowedTypeIds);
      }
    }

    return { sql: parts.length > 0 ? ` ${parts.join(" ")}` : "", params };
  }

  listNodesWithBodyLike(pattern: string): { id: string; body: string }[] {
    return this.db
      .prepare(
        `SELECT id, body
         FROM nodes
         WHERE body LIKE ?`,
      )
      .all(pattern) as { id: string; body: string }[];
  }

  listNodesForGraphExport(): { id: string; title: string }[] {
    return this.db
      .prepare(
        `SELECT id, ${NODE_DISPLAY_TITLE_SQL} AS title
         FROM nodes`,
      )
      .all() as { id: string; title: string }[];
  }

  listRelationshipsForGraphExport(): {
    id: string;
    sourceNodeId: string;
    targetNodeId: string;
    type: string;
  }[] {
    return this.db
      .prepare("SELECT id, source_node_id, target_node_id, type FROM relationship_projections")
      .all()
      .map((row) => {
        const r = row as {
          id: string;
          source_node_id: string;
          target_node_id: string;
          type: string;
        };
        return {
          id: r.id,
          sourceNodeId: r.source_node_id,
          targetNodeId: r.target_node_id,
          type: r.type,
        };
      });
  }

  listRelationshipsFromSource(sourceNodeId: string, type?: string): Relationship[] {
    const rows = type
      ? (this.db
          .prepare(
            `SELECT id, record_id, source_node_id, target_node_id, type, ordinal, "order", priority
             FROM relationship_projections WHERE source_node_id = ? AND type = ? ORDER BY id`,
          )
          .all(sourceNodeId, type) as ProjectionRow[])
      : (this.db
          .prepare(
            `SELECT id, record_id, source_node_id, target_node_id, type, ordinal, "order", priority
             FROM relationship_projections WHERE source_node_id = ? ORDER BY type, id`,
          )
          .all(sourceNodeId) as ProjectionRow[]);

    return this.mapProjectionRows(rows);
  }

  listRelationshipsToTarget(targetNodeId: string, type?: string): Relationship[] {
    const rows = type
      ? (this.db
          .prepare(
            `SELECT id, record_id, source_node_id, target_node_id, type, ordinal, "order", priority
             FROM relationship_projections WHERE target_node_id = ? AND type = ? ORDER BY id`,
          )
          .all(targetNodeId, type) as ProjectionRow[])
      : (this.db
          .prepare(
            `SELECT id, record_id, source_node_id, target_node_id, type, ordinal, "order", priority
             FROM relationship_projections WHERE target_node_id = ? ORDER BY id`,
          )
          .all(targetNodeId) as ProjectionRow[]);

    return this.mapProjectionRows(rows);
  }

  listOutgoingProjectionTypes(sourceNodeId: string): string[] {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT type FROM relationship_projections
         WHERE source_node_id = ? ORDER BY type`,
      )
      .all(sourceNodeId) as { type: string }[];
    return rows.map((row) => row.type);
  }

  listOutgoingProjectionPropertyKeys(sourceNodeId: string, type: string): string[] {
    const keys = new Set<string>();
    const eavRows = this.db
      .prepare(
        `SELECT DISTINCT rpp.key AS key
         FROM relationship_projection_properties rpp
         INNER JOIN relationship_projections rp ON rp.id = rpp.projection_id
         WHERE rp.source_node_id = ? AND rp.type = ?`,
      )
      .all(sourceNodeId, type) as { key: string }[];
    for (const row of eavRows) {
      if (row.key) keys.add(row.key);
    }
    const hasPriority = this.db
      .prepare(
        `SELECT 1 AS ok FROM relationship_projections
         WHERE source_node_id = ? AND type = ? AND priority IS NOT NULL LIMIT 1`,
      )
      .get(sourceNodeId, type) as { ok: number } | null;
    if (hasPriority) keys.add("priority");
    return [...keys].sort((a, b) => a.localeCompare(b));
  }

  listRelationshipsFromSourceWindow(
    sourceNodeId: string,
    type: string,
    query?: RelationshipProjectionWindowQuery,
  ): RelationshipProjectionWindowResult {
    const run = (): RelationshipProjectionWindowResult => {
      const total = withProfilingSpan("relationWindow.count", "INTERNAL", {}, () => {
        const totalRow = this.db
          .prepare(
            `SELECT COUNT(*) AS c FROM relationship_projections
             WHERE source_node_id = ? AND type = ?`,
          )
          .get(sourceNodeId, type) as { c: number };
        return totalRow.c;
      });

      const orderBy = buildOutgoingProjectionOrderBy(query?.sorts);
      const offsetRaw = query?.offset;
      const offset =
        typeof offsetRaw === "number" && Number.isFinite(offsetRaw) && offsetRaw > 0
          ? Math.floor(offsetRaw)
          : 0;
      const limitRaw = query?.limit;
      const limit =
        limitRaw === undefined || limitRaw === null
          ? null
          : typeof limitRaw === "number" && Number.isFinite(limitRaw) && limitRaw > 0
            ? Math.floor(limitRaw)
            : null;

      const selectSql = `SELECT rp.id, rp.record_id, rp.source_node_id, rp.target_node_id, rp.type,
              rp.ordinal, rp."order", rp.priority
       FROM relationship_projections rp
       LEFT JOIN nodes n ON n.id = rp.target_node_id
       WHERE rp.source_node_id = ? AND rp.type = ?
       ${orderBy}`;

      const rows = withProfilingSpan("relationWindow.page", "INTERNAL", {}, () => {
        if (limit === null) {
          return this.db.prepare(selectSql).all(sourceNodeId, type) as ProjectionRow[];
        }
        return this.db
          .prepare(`${selectSql} LIMIT ? OFFSET ?`)
          .all(sourceNodeId, type, limit, offset) as ProjectionRow[];
      });

      const relationships = withProfilingSpan("relationWindow.mapRows", "INTERNAL", {}, () =>
        this.mapProjectionRows(rows),
      );

      return { relationships, total };
    };

    if (!isProfilingEnabled()) return run();
    return withProfilingSpan("listRelationshipsFromSourceWindow", "INTERNAL", {}, run);
  }


  listMemberPage(setId: string, query: MemberPageQuery): MemberPageResult {
    const emitted = compileMemberPage(setId, query, "page");
    if (emitted.empty) {
      const empty: MemberPageResult = { relationships: [], total: 0 };
      if (query.groups) empty.groupIds = [];
      if (query.relationFields && query.relationFields.length > 0) {
        empty.relationFieldsByRow = [];
      }
      return empty;
    }

    let total = 0;
    if (emitted.countSql) {
      const totalRow = this.db
        .prepare(emitted.countSql)
        .get(...emitted.countParams) as { c: number };
      total = totalRow.c;
    }

    const { limit, offset } = (() => {
      const offsetRaw = query.offset;
      const off =
        typeof offsetRaw === "number" && Number.isFinite(offsetRaw) && offsetRaw > 0
          ? Math.floor(offsetRaw)
          : 0;
      const limitRaw = query.limit;
      const lim =
        limitRaw === undefined || limitRaw === null
          ? null
          : typeof limitRaw === "number" && Number.isFinite(limitRaw) && limitRaw > 0
            ? Math.floor(limitRaw)
            : null;
      return { limit: lim, offset: off };
    })();

    type Row = ProjectionRow & { resolved_group_id?: string | null };
    let rows: Row[];
    if (!emitted.applyLimitOffset || limit === null) {
      rows = this.db.prepare(emitted.pageSql).all(...emitted.pageParams) as Row[];
    } else {
      rows = this.db
        .prepare(`${emitted.pageSql} LIMIT ? OFFSET ?`)
        .all(...emitted.pageParams, limit, offset) as Row[];
    }

    if (query.memberIds && query.memberIds.length > 0) {
      total = rows.length;
    }

    const relationships = this.mapProjectionRows(rows);
    const result: MemberPageResult = { relationships, total };

    if (emitted.includeGroupId || query.groups) {
      result.groupIds = rows.map((row) =>
        typeof row.resolved_group_id === "string" && row.resolved_group_id
          ? row.resolved_group_id
          : null,
      );
    }

    if (query.relationFields && query.relationFields.length > 0) {
      result.relationFieldsByRow = relationFieldsByRowFromSqlRows(
        rows as unknown as Record<string, unknown>[],
        emitted.relationColumns,
      );
    }
    return result;
  }

  listMemberPageNodeIds(setId: string, query: MemberPageQuery): string[] {
    const emitted = compileMemberPage(setId, query, "ids");
    if (emitted.empty) return [];
    const rows = this.db
      .prepare(emitted.pageSql)
      .all(...emitted.pageParams) as { member_id?: string; id?: string }[];
    return rows.map((row) => row.member_id ?? row.id!).filter(Boolean);
  }

  listRelatedTargetNodeIds(sourceNodeId: string, type: string): string[] {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT target_node_id AS id
         FROM relationship_projections
         WHERE source_node_id = ? AND type = ?`,
      )
      .all(sourceNodeId, type) as { id: string }[];
    return rows.map((row) => row.id);
  }

  listRelationshipsFromSourceForTargetIds(
    sourceNodeId: string,
    type: string,
    targetIds: readonly string[],
  ): Relationship[] {
    if (targetIds.length === 0) return [];
    const placeholders = targetIds.map(() => "?").join(", ");
    const rows = this.db
      .prepare(
        `SELECT rp.id, rp.record_id, rp.source_node_id, rp.target_node_id, rp.type,
                rp.ordinal, rp."order", rp.priority
         FROM relationship_projections rp
         WHERE rp.source_node_id = ? AND rp.type = ?
           AND rp.target_node_id IN (${placeholders})`,
      )
      .all(sourceNodeId, type, ...targetIds) as ProjectionRow[];
    return this.mapProjectionRows(rows);
  }

  getExpressionIndexStatus(digest: string): "ready" | "stale" | "building" | "missing" {
    const row = this.db
      .prepare("SELECT status FROM expression_indexes WHERE digest = ?")
      .get(digest) as { status: string } | undefined;
    if (!row) return "missing";
    if (row.status === "ready" || row.status === "stale" || row.status === "building") {
      return row.status;
    }
    return "stale";
  }

  getExpressionIndexDirtyMemberIds(digest: string): string[] | null {
    const row = this.db
      .prepare("SELECT dirty_member_ids FROM expression_indexes WHERE digest = ?")
      .get(digest) as { dirty_member_ids: string | null } | undefined;
    if (!row) return null;
    if (row.dirty_member_ids == null) return null;
    try {
      const parsed = JSON.parse(row.dirty_member_ids) as unknown;
      if (!Array.isArray(parsed)) return null;
      return parsed.filter((id): id is string => typeof id === "string" && id.trim().length > 0);
    } catch {
      return null;
    }
  }

  replaceExpressionIndexValues(
    digest: string,
    expressionJson: string,
    values: readonly { memberId: string; sortValue: number }[],
  ): void {
    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO expression_indexes (digest, status, built_at, expression_json, dirty_member_ids)
           VALUES (?, 'building', NULL, ?, NULL)
           ON CONFLICT(digest) DO UPDATE SET
             status = 'building',
             expression_json = excluded.expression_json,
             dirty_member_ids = NULL`,
        )
        .run(digest, expressionJson);
      this.db.prepare("DELETE FROM expression_index_values WHERE digest = ?").run(digest);
      const insert = this.db.prepare(
        `INSERT INTO expression_index_values (digest, member_id, sort_value) VALUES (?, ?, ?)`,
      );
      for (const row of values) {
        insert.run(digest, row.memberId, row.sortValue);
      }
      this.db
        .prepare(
          `UPDATE expression_indexes SET status = 'ready', built_at = ?, dirty_member_ids = NULL WHERE digest = ?`,
        )
        .run(new Date().toISOString(), digest);
    });
    tx();
  }

  upsertExpressionIndexValues(
    digest: string,
    expressionJson: string,
    values: readonly { memberId: string; sortValue: number }[],
  ): void {
    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO expression_indexes (digest, status, built_at, expression_json, dirty_member_ids)
           VALUES (?, 'building', NULL, ?, NULL)
           ON CONFLICT(digest) DO UPDATE SET
             status = 'building',
             expression_json = excluded.expression_json`,
        )
        .run(digest, expressionJson);
      const upsert = this.db.prepare(
        `INSERT INTO expression_index_values (digest, member_id, sort_value) VALUES (?, ?, ?)
         ON CONFLICT(digest, member_id) DO UPDATE SET sort_value = excluded.sort_value`,
      );
      for (const row of values) {
        upsert.run(digest, row.memberId, row.sortValue);
      }
      this.db
        .prepare(
          `UPDATE expression_indexes SET status = 'ready', built_at = ?, dirty_member_ids = NULL WHERE digest = ?`,
        )
        .run(new Date().toISOString(), digest);
    });
    tx();
  }

  deleteExpressionIndexValues(digest: string, memberIds: readonly string[]): void {
    if (memberIds.length === 0) return;
    const placeholders = memberIds.map(() => "?").join(", ");
    this.db
      .prepare(
        `DELETE FROM expression_index_values WHERE digest = ? AND member_id IN (${placeholders})`,
      )
      .run(digest, ...memberIds);
  }

  markExpressionIndexesStale(digest?: string): void {
    if (digest?.trim()) {
      this.db
        .prepare(
          `UPDATE expression_indexes
           SET status = 'stale', dirty_member_ids = NULL
           WHERE digest = ? AND status = 'ready'`,
        )
        .run(digest.trim());
      return;
    }
    this.db.exec(
      `UPDATE expression_indexes SET status = 'stale', dirty_member_ids = NULL WHERE status = 'ready'`,
    );
  }

  markExpressionIndexesStaleForTypes(
    types: readonly string[],
    dirtyMemberIds?: readonly string[],
  ): void {
    const typeSet = new Set(
      types.map((t) => t.trim()).filter((t) => t.length > 0),
    );
    if (typeSet.size === 0) return;

    const rows = this.db
      .prepare(
        `SELECT digest, expression_json, dirty_member_ids FROM expression_indexes WHERE status = 'ready'`,
      )
      .all() as {
      digest: string;
      expression_json: string;
      dirty_member_ids: string | null;
    }[];

    const dirtyProvided = dirtyMemberIds !== undefined;
    const incomingDirty = dirtyProvided
      ? [
          ...new Set(
            dirtyMemberIds
              .map((id) => id.trim())
              .filter((id) => id.length > 0),
          ),
        ]
      : null;

    const mark = this.db.prepare(
      `UPDATE expression_indexes SET status = 'stale', dirty_member_ids = ? WHERE digest = ?`,
    );

    for (const row of rows) {
      let reachTypes: string[] | null = null;
      try {
        const parsed = JSON.parse(row.expression_json) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const raw = (parsed as { reachTypes?: unknown }).reachTypes;
          if (Array.isArray(raw)) {
            reachTypes = raw.filter((t): t is string => typeof t === "string");
          }
        }
      } catch {
        /* legacy / corrupt → treat as matching all */
      }

      const matches =
        reachTypes == null ||
        reachTypes.length === 0 ||
        reachTypes.some((t) => typeSet.has(t));
      if (!matches) continue;

      let dirtyJson: string | null = null;
      if (dirtyProvided && incomingDirty) {
        const prior = new Set<string>();
        if (row.dirty_member_ids != null) {
          try {
            const priorParsed = JSON.parse(row.dirty_member_ids) as unknown;
            if (Array.isArray(priorParsed)) {
              for (const id of priorParsed) {
                if (typeof id === "string" && id.trim()) prior.add(id.trim());
              }
            }
          } catch {
            /* ignore */
          }
        }
        for (const id of incomingDirty) prior.add(id);
        dirtyJson = JSON.stringify([...prior]);
      }
      mark.run(dirtyJson, row.digest);
    }
  }

  listDistinctSetMemberScopeIds(
    setId: string,
    query: DistinctSetMemberScopeQuery,
  ): DistinctSetMemberScopeRow[] {
    const membership = buildMembershipCte(setId, query.projections ?? []);
    if (!membership) return [];

    const scopeType = query.scopeProjectionType?.trim();
    if (!scopeType) return [];

    const orderTypes = (query.scopeOrderProjectionTypes ?? [])
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    let orderExpr = "999";
    const orderParams: SQLQueryBindings[] = [];
    if (orderTypes.length > 0) {
      const placeholders = orderTypes.map(() => "?").join(", ");
      orderExpr = `COALESCE(
        (SELECT rp."order" FROM relationship_projections rp
         WHERE rp.source_node_id = s.scope_id AND rp.type IN (${placeholders})
           AND rp."order" IS NOT NULL
         ORDER BY rp."order" ASC LIMIT 1),
        999
      )`;
      orderParams.push(...orderTypes);
    }

    const titleSql = `COALESCE(NULLIF(n.title, ''), NULLIF(n.alias, ''), 'Untitled')`;
    const sql = `${membership.sql},
      scopes AS (
        SELECT DISTINCT sp.target_node_id AS scope_id
        FROM members m
        INNER JOIN relationship_projections sp
          ON sp.source_node_id = m.member_id AND sp.type = ?
        UNION
        SELECT DISTINCT sp.source_node_id AS scope_id
        FROM members m
        INNER JOIN relationship_projections sp
          ON sp.target_node_id = m.member_id AND sp.type = ?
      )
      SELECT s.scope_id AS id,
             ${titleSql} AS title,
             ${orderExpr} AS sort_key
      FROM scopes s
      LEFT JOIN nodes n ON n.id = s.scope_id
      ORDER BY sort_key ASC, title COLLATE NOCASE ASC, s.scope_id ASC`;

    const rows = this.db
      .prepare(sql)
      .all(...membership.params, scopeType, scopeType, ...orderParams) as {
      id: string;
      title: string;
      sort_key: number;
    }[];

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      sortKey: typeof row.sort_key === "number" ? row.sort_key : Number(row.sort_key) || 999,
    }));
  }

  listComposedGroupHeaders(query: ComposedGroupHeadersQuery): ComposedGroupHeaderRow[] {
    const groupSetId = query.groupTypeDatabaseId?.trim();
    if (!groupSetId) return [];

    const membership = buildMembershipCte(groupSetId, query.groupSetProjections ?? []);
    if (!membership) return [];

    const scopeType = query.groupToScopeProjectionType?.trim();
    const scopeId = query.scopeNodeId?.trim();
    const filterByScope = Boolean(scopeType && scopeId);

    const scopeFilterSql = filterByScope
      ? `WHERE (
           EXISTS (
             SELECT 1 FROM relationship_projections gsp
             WHERE gsp.source_node_id = m.member_id AND gsp.type = ? AND gsp.target_node_id = ?
           )
           OR EXISTS (
             SELECT 1 FROM relationship_projections gsp
             WHERE gsp.target_node_id = m.member_id AND gsp.type = ? AND gsp.source_node_id = ?
           )
         )`
      : "";

    const titleSql = `COALESCE(NULLIF(n.title, ''), NULLIF(n.alias, ''), 'Untitled')`;
    const sortKeySql = `COALESCE(
      (SELECT rp."order" FROM relationship_projections rp
       WHERE rp.source_node_id = m.member_id AND rp.target_node_id = ?
         AND rp."order" IS NOT NULL
       ORDER BY rp."order" ASC LIMIT 1),
      (SELECT rp."order" FROM relationship_projections rp
       WHERE rp.target_node_id = m.member_id AND rp.source_node_id = ?
         AND rp."order" IS NOT NULL
       ORDER BY rp."order" ASC LIMIT 1),
      999
    )`;

    const sql = `${membership.sql}
      SELECT m.member_id AS id,
             ${titleSql} AS title,
             ${sortKeySql} AS sort_key
      FROM members m
      LEFT JOIN nodes n ON n.id = m.member_id
      ${scopeFilterSql}
      ORDER BY sort_key ASC, title COLLATE NOCASE ASC, m.member_id ASC`;

    const params: SQLQueryBindings[] = [...membership.params, groupSetId, groupSetId];
    if (filterByScope && scopeType && scopeId) {
      params.push(scopeType, scopeId, scopeType, scopeId);
    }

    const rows = this.db.prepare(sql).all(...params) as {
      id: string;
      title: string;
      sort_key: number;
    }[];

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      sortKey: typeof row.sort_key === "number" ? row.sort_key : Number(row.sort_key) || 999,
    }));
  }

  countIncidentRelationships(nodeId: string): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS c FROM relationship_projections
         WHERE source_node_id = ? OR target_node_id = ?`,
      )
      .get(nodeId, nodeId) as { c: number };
    return row.c;
  }

  /** Distinct local perspective types present in relationship_projections (sorted). */
  listDistinctRelationshipTypes(): string[] {
    const rows = this.db
      .prepare("SELECT DISTINCT type FROM relationship_projections ORDER BY type")
      .all() as { type: string }[];
    return rows.map((row) => row.type);
  }

  /** Node ids that appear as source or target of at least one projection of `type`. */
  listNodeIdsForProjectionType(projectionType: string): string[] {
    const trimmed = projectionType.trim();
    if (!trimmed) return [];
    const rows = this.db
      .prepare(
        `SELECT DISTINCT node_id FROM (
           SELECT source_node_id AS node_id FROM relationship_projections WHERE type = ?
           UNION
           SELECT target_node_id AS node_id FROM relationship_projections WHERE type = ?
         )`,
      )
      .all(trimmed, trimmed) as { node_id: string }[];
    return rows.map((row) => row.node_id);
  }

  /** Node ids that appear as source of at least one projection of `type`. */
  listSourceNodeIdsForProjectionType(projectionType: string): string[] {
    const trimmed = projectionType.trim();
    if (!trimmed) return [];
    const rows = this.db
      .prepare(
        `SELECT DISTINCT source_node_id AS node_id
         FROM relationship_projections
         WHERE type = ?`,
      )
      .all(trimmed) as { node_id: string }[];
    return rows.map((row) => row.node_id);
  }

  /** Run a read query (used by overlay / dynamic-field modules). */
  queryAll<T extends Record<string, unknown>>(sql: string, ...params: SQLQueryBindings[]): T[] {
    // SQL timing comes from instrumentSqliteDatabaseForProfiling on prepare().all.
    return this.db.prepare(sql).all(...params) as T[];
  }

  /** Run a write statement (used by overlay seed / migration scripts). */
  runExec(sql: string, ...params: SQLQueryBindings[]): void {
    this.db.prepare(sql).run(...params);
  }

  /** Compact and optimize for deterministic, git-friendly storage. */
  finalize(): void {
    this.db.exec("PRAGMA optimize");
    this.db.exec("VACUUM");
  }

  close(): void {
    this.db.close();
  }
}
