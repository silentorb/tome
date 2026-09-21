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
  SetMemberWindowQuery,
  SetMemberWindowResult,
  DistinctSetMemberScopeQuery,
  DistinctSetMemberScopeRow,
  ComposedMemberWindowQuery,
  ComposedMemberWindowResult,
  ComposedGroupHeadersQuery,
  ComposedGroupHeaderRow,
  SetMemberProjectionPair,
  TomeQueryCache,
} from "tome-service-interfaces";
import {
  isProfilingEnabled,
  recordProfilingSample,
  truncateSql,
} from "tome-service-interfaces";
import { migrateSchema } from "./schema-migrate";
import {
  DDL,
  PROMOTED_NODE_COLUMN_SET,
  PROMOTED_RELATIONSHIP_COLUMN_SET,
  SCHEMA_VERSION,
} from "./schema";

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
const MEMBER_DISPLAY_TITLE_SQL = `COALESCE(NULLIF(n.title, ''), NULLIF(n.alias, ''), 'Untitled')`;

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

function memberEdgePropertyOrderExpression(propertyKey: string): string {
  if (propertyKey === "ordinal") return "m.ordinal";
  if (propertyKey === "order") return `m."order"`;
  if (propertyKey === "priority") return "m.priority";
  return `(SELECT json_extract(value, '$') FROM relationship_projection_properties WHERE projection_id = m.id AND key = '${propertyKey}')`;
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

type MemberOrderBy = { sql: string; params: SQLQueryBindings[] };

type MembershipCte = { sql: string; params: SQLQueryBindings[] };

/** Shared membership union + dedupe CTE used by Items and composed windows. */
function buildMembershipCte(
  setId: string,
  pairs: readonly SetMemberProjectionPair[],
): MembershipCte | null {
  const unionParts: string[] = [];
  const unionParams: SQLQueryBindings[] = [];
  for (const pair of pairs) {
    const setProjection = pair.setProjection?.trim();
    const memberProjection = pair.memberProjection?.trim();
    if (!setProjection || !memberProjection) continue;
    unionParts.push(
      `SELECT rp.id, rp.record_id, rp.target_node_id AS member_id, rp.source_node_id AS set_id,
              rp.type, rp.ordinal, rp."order", rp.priority, 0 AS side_rank
       FROM relationship_projections rp
       WHERE rp.source_node_id = ? AND rp.type = ?`,
    );
    unionParams.push(setId, setProjection);
    unionParts.push(
      `SELECT rp.id, rp.record_id, rp.source_node_id AS member_id, rp.target_node_id AS set_id,
              rp.type, rp.ordinal, rp."order", rp.priority, 1 AS side_rank
       FROM relationship_projections rp
       WHERE rp.target_node_id = ? AND rp.type = ?`,
    );
    unionParams.push(setId, memberProjection);
  }
  if (unionParts.length === 0) return null;

  return {
    sql: `
      WITH membership AS (
        ${unionParts.join("\nUNION ALL\n")}
      ),
      ranked AS (
        SELECT *,
          ROW_NUMBER() OVER (PARTITION BY member_id ORDER BY side_rank ASC, id ASC) AS rn
        FROM membership
      ),
      members AS (
        SELECT id, record_id, member_id, set_id, type, ordinal, "order", priority
        FROM ranked
        WHERE rn = 1
      )`,
    params: unionParams,
  };
}

function parseLimitOffset(query: {
  limit?: number | null;
  offset?: number;
}): { limit: number | null; offset: number } {
  const offsetRaw = query.offset;
  const offset =
    typeof offsetRaw === "number" && Number.isFinite(offsetRaw) && offsetRaw > 0
      ? Math.floor(offsetRaw)
      : 0;
  const limitRaw = query.limit;
  const limit =
    limitRaw === undefined || limitRaw === null
      ? null
      : typeof limitRaw === "number" && Number.isFinite(limitRaw) && limitRaw > 0
        ? Math.floor(limitRaw)
        : null;
  return { limit, offset };
}

function buildSetMemberOrderBy(
  sorts: readonly { column: string; direction: "asc" | "desc" }[] | undefined,
  relationCounts: readonly { column: string; projectionTypes: string[] }[] | undefined,
  defaultOrdered: boolean,
): MemberOrderBy {
  const clauses: string[] = [];
  const params: SQLQueryBindings[] = [];
  if (sorts && sorts.length > 0) {
    for (const sort of sorts) {
      const dir = sort.direction === "desc" ? "DESC" : "ASC";
      const col = sort.column.trim();
      if (!col) continue;
      if (col === "name") {
        if (!isSafeSqlPropertyKey(col)) continue;
        clauses.push(`${MEMBER_DISPLAY_TITLE_SQL} COLLATE NOCASE ${dir}`);
        continue;
      }
      if (!isSafeSqlPropertyKey(col)) continue;
      const relationEntry = relationCounts?.find((r) => r.column === col);
      if (relationEntry) {
        const safeTypes = relationEntry.projectionTypes.filter(
          (t) => typeof t === "string" && /^[A-Za-z0-9_.:-]+$/.test(t.trim()),
        );
        if (safeTypes.length === 0) continue;
        const placeholders = safeTypes.map(() => "?").join(", ");
        clauses.push(
          `(SELECT COUNT(*) FROM relationship_projections rcount WHERE rcount.source_node_id = m.member_id AND rcount.type IN (${placeholders})) ${dir}`,
        );
        params.push(...safeTypes.map((t) => t.trim()));
        continue;
      }
      clauses.push(`${memberEdgePropertyOrderExpression(col)} ${dir}`);
    }
  }
  if (clauses.length === 0) {
    if (defaultOrdered) {
      clauses.push(`CASE WHEN m."order" IS NULL THEN 1 ELSE 0 END ASC`);
      clauses.push(`m."order" ASC`);
    }
    clauses.push(`${MEMBER_DISPLAY_TITLE_SQL} COLLATE NOCASE ASC`);
    clauses.push("m.id ASC");
  } else {
    clauses.push(`${MEMBER_DISPLAY_TITLE_SQL} COLLATE NOCASE ASC`);
    clauses.push("m.id ASC");
  }
  return { sql: `ORDER BY ${clauses.join(", ")}`, params };
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
    this.db = new Database(path, { create: true });
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
  }

  upsertRelationshipRecord(record: RelationshipRecordRow): void {
    this.insertRecord.run(record.id, record.nodeA, record.nodeB, record.compositeType);
    if (Object.keys(record.properties).length === 0) return;
    const existing = this.getRelationshipRecord(record.id);
    if (!existing) return;
    const merged = mergeProperties(existing.properties, record.properties);
    this.writeRecordProperties(record.id, this.propertyCodec.encode(merged));
  }

  upsertRelationshipProjection(projection: RelationshipProjectionRow): void {
    this.insertProjection.run(
      projection.id,
      projection.recordId,
      projection.sourceNodeId,
      projection.targetNodeId,
      projection.type,
    );
    if (Object.keys(projection.properties).length === 0) return;
    const existing = this.getRelationship(projection.id);
    if (!existing) return;
    const merged = mergeProperties(existing.properties, projection.properties);
    this.writeProjectionProperties(projection.id, this.propertyCodec.encode(merged));
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
    if (Object.keys(properties).length === 0) return;
    const existing = this.getRelationship(id);
    if (!existing) return;
    const merged = mergeProperties(existing.properties, properties);
    const encoded = this.propertyCodec.encode(merged);
    this.writeRecordProperties(id, encoded);
    this.writeProjectionProperties(id, encoded);
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
  }

  deleteRelationship(sourceNodeId: string, targetNodeId: string, type: string): boolean {
    const id = relationshipId(sourceNodeId, type, targetNodeId);
    const row = this.getRelationship(id);
    if (!row?.recordId) {
      const result = this.db
        .prepare("DELETE FROM relationship_projections WHERE id = ?")
        .run(id);
      return result.changes > 0;
    }
    const result = this.db
      .prepare("DELETE FROM relationship_records WHERE id = ?")
      .run(row.recordId);
    return result.changes > 0;
  }

  deleteNode(id: string): boolean {
    const result = this.db.prepare("DELETE FROM nodes WHERE id = ?").run(id);
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
  ): { id: string; title: string }[] {
    const fetchBatch = (batchLimit: number) =>
      this.db
        .prepare(
          `SELECT id, ${NODE_DISPLAY_TITLE_SQL} AS title
           FROM nodes
           WHERE is_archived = 0
             AND COALESCE(title, alias, '') LIKE ? ESCAPE '\\'
           ORDER BY title COLLATE NOCASE
           LIMIT ?`,
        )
        .all(pattern, batchLimit) as { id: string; title: string }[];

    return this.collectTitleOrderedNodes(limit, allowedTypeIds, fetchBatch);
  }

  searchNodesByBody(
    pattern: string,
    limit: number,
    allowedTypeIds?: readonly string[],
  ): { id: string; title: string }[] {
    const fetchBatch = (batchLimit: number) =>
      this.db
        .prepare(
          `SELECT id, ${NODE_DISPLAY_TITLE_SQL} AS title
           FROM nodes
           WHERE is_archived = 0
             AND COALESCE(body, '') LIKE ? ESCAPE '\\'
           ORDER BY title COLLATE NOCASE
           LIMIT ?`,
        )
        .all(pattern, batchLimit) as { id: string; title: string }[];

    return this.collectTitleOrderedNodes(limit, allowedTypeIds, fetchBatch);
  }

  listNodesByTitle(
    limit: number,
    allowedTypeIds?: readonly string[],
  ): { id: string; title: string }[] {
    const fetchBatch = (batchLimit: number) =>
      this.db
        .prepare(
          `SELECT id, ${NODE_DISPLAY_TITLE_SQL} AS title
           FROM nodes
           WHERE is_archived = 0
             AND (title IS NOT NULL OR alias IS NOT NULL)
           ORDER BY title COLLATE NOCASE
           LIMIT ?`,
        )
        .all(batchLimit) as { id: string; title: string }[];

    return this.collectTitleOrderedNodes(limit, allowedTypeIds, fetchBatch);
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

  private filterTitleOrderedNodesByAllowedType(
    rows: readonly { id: string; title: string }[],
    limit: number,
    allowedTypeIds: readonly string[],
  ): { id: string; title: string }[] {
    const matched: { id: string; title: string }[] = [];
    for (const row of rows) {
      if (!this.nodeMatchesAnyAllowedType(row.id, allowedTypeIds)) continue;
      matched.push(row);
      if (matched.length >= limit) break;
    }
    return matched;
  }

  private collectTitleOrderedNodes(
    limit: number,
    allowedTypeIds: readonly string[] | undefined,
    fetchBatch: (batchLimit: number) => { id: string; title: string }[],
  ): { id: string; title: string }[] {
    if (!allowedTypeIds || allowedTypeIds.length === 0) {
      return fetchBatch(limit);
    }

    let fetchLimit = limit;
    const maxFetch = 5000;
    while (fetchLimit <= maxFetch) {
      const rows = fetchBatch(fetchLimit);
      const matched = this.filterTitleOrderedNodesByAllowedType(rows, limit, allowedTypeIds);
      if (matched.length >= limit || rows.length < fetchLimit) {
        return matched;
      }
      fetchLimit = Math.min(fetchLimit * 2, maxFetch);
    }

    return this.filterTitleOrderedNodesByAllowedType(fetchBatch(maxFetch), limit, allowedTypeIds);
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
    const totalRow = this.db
      .prepare(
        `SELECT COUNT(*) AS c FROM relationship_projections
         WHERE source_node_id = ? AND type = ?`,
      )
      .get(sourceNodeId, type) as { c: number };
    const total = totalRow.c;

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

    let rows: ProjectionRow[];
    if (limit === null) {
      rows = this.db.prepare(selectSql).all(sourceNodeId, type) as ProjectionRow[];
    } else {
      rows = this.db
        .prepare(`${selectSql} LIMIT ? OFFSET ?`)
        .all(sourceNodeId, type, limit, offset) as ProjectionRow[];
    }

    return {
      relationships: this.mapProjectionRows(rows),
      total,
    };
  }

  listSetMemberRowConnectionsWindow(
    setId: string,
    query: SetMemberWindowQuery,
  ): SetMemberWindowResult {
    const membership = buildMembershipCte(setId, query.projections ?? []);
    if (!membership) {
      return { relationships: [], total: 0 };
    }

    const totalRow = this.db
      .prepare(`${membership.sql} SELECT COUNT(*) AS c FROM members`)
      .get(...membership.params) as { c: number };
    const total = totalRow.c;

    const { sql: orderBySql, params: orderParams } = buildSetMemberOrderBy(
      query.sorts,
      query.relationCounts,
      Boolean(query.defaultOrdered),
    );

    const { limit, offset } = parseLimitOffset(query);

    const selectSql = `${membership.sql}
      SELECT m.id, m.record_id, m.member_id AS source_node_id, m.set_id AS target_node_id,
             m.type, m.ordinal, m."order", m.priority
      FROM members m
      LEFT JOIN nodes n ON n.id = m.member_id
      ${orderBySql}`;

    const selectParams = [...membership.params, ...orderParams];
    let rows: ProjectionRow[];
    if (limit === null) {
      rows = this.db.prepare(selectSql).all(...selectParams) as ProjectionRow[];
    } else {
      rows = this.db
        .prepare(`${selectSql} LIMIT ? OFFSET ?`)
        .all(...selectParams, limit, offset) as ProjectionRow[];
    }

    return {
      relationships: this.mapProjectionRows(rows),
      total,
    };
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

  listComposedSetMemberRowConnectionsWindow(
    setId: string,
    query: ComposedMemberWindowQuery,
  ): ComposedMemberWindowResult {
    const membership = buildMembershipCte(setId, query.projections ?? []);
    if (!membership) {
      return { relationships: [], groupIds: [], total: 0 };
    }

    const scopeType = query.scope?.projectionType?.trim();
    const scopeId = query.scope?.scopeNodeId?.trim();
    const hasScope = Boolean(scopeType && scopeId);

    const groups = query.groups;
    const memberToGroupType = groups?.memberToGroupProjectionType?.trim() ?? "";
    const groupTypeDatabaseId = groups?.groupTypeDatabaseId?.trim() ?? "";
    const hasGroups = Boolean(memberToGroupType && groupTypeDatabaseId);
    const groupToScopeType = groups?.groupToScopeProjectionType?.trim();
    const groupScopeId = (groups?.scopeNodeId ?? query.scope?.scopeNodeId)?.trim();
    const filterGroupScope = Boolean(hasGroups && groupToScopeType && groupScopeId);
    const canonical = hasGroups && groups?.canonicalGroupByTitle !== false;
    const defaultOrdered = Boolean(query.defaultOrdered);
    const titleSql = `COALESCE(NULLIF(n.title, ''), NULLIF(n.alias, ''), 'Untitled')`;
    const groupTitleSql = `COALESCE(NULLIF(gn.title, ''), NULLIF(gn.alias, ''), 'Untitled')`;

    const params: SQLQueryBindings[] = [...membership.params];
    let withSql = membership.sql.trim();

    if (hasScope && scopeType && scopeId) {
      withSql += `,
      scoped_members AS (
        SELECT m.*
        FROM members m
        WHERE EXISTS (
          SELECT 1 FROM relationship_projections sp
          WHERE sp.source_node_id = m.member_id AND sp.type = ? AND sp.target_node_id = ?
        )
        OR EXISTS (
          SELECT 1 FROM relationship_projections sp
          WHERE sp.target_node_id = m.member_id AND sp.type = ? AND sp.source_node_id = ?
        )
      )`;
      params.push(scopeType, scopeId, scopeType, scopeId);
    } else {
      withSql += `,
      scoped_members AS (SELECT * FROM members)`;
    }

    if (hasGroups) {
      const groupPairs = groups?.groupSetProjections ?? [];
      const groupUnion: string[] = [];
      const groupParams: SQLQueryBindings[] = [];
      for (const pair of groupPairs) {
        const setProjection = pair.setProjection?.trim();
        const memberProjection = pair.memberProjection?.trim();
        if (!setProjection || !memberProjection) continue;
        groupUnion.push(
          `SELECT rp.target_node_id AS group_id, rp."order" AS group_order, 0 AS side_rank, rp.id AS edge_id
           FROM relationship_projections rp
           WHERE rp.source_node_id = ? AND rp.type = ?`,
        );
        groupParams.push(groupTypeDatabaseId, setProjection);
        groupUnion.push(
          `SELECT rp.source_node_id AS group_id, rp."order" AS group_order, 1 AS side_rank, rp.id AS edge_id
           FROM relationship_projections rp
           WHERE rp.target_node_id = ? AND rp.type = ?`,
        );
        groupParams.push(groupTypeDatabaseId, memberProjection);
      }

      if (groupUnion.length === 0) {
        withSql += `,
      member_with_group AS (
        SELECT sm.*, CAST(NULL AS TEXT) AS group_id, CAST(NULL AS REAL) AS group_sort_key,
               CAST(NULL AS TEXT) AS group_title
        FROM scoped_members sm
      )`;
      } else {
        withSql += `,
      group_membership AS (
        ${groupUnion.join("\nUNION ALL\n")}
      ),
      group_ranked AS (
        SELECT *,
          ROW_NUMBER() OVER (PARTITION BY group_id ORDER BY side_rank ASC, edge_id ASC) AS rn
        FROM group_membership
      ),
      group_headers AS (
        SELECT gr.group_id,
               COALESCE(gr.group_order, 999) AS sort_key,
               ${groupTitleSql} AS title
        FROM group_ranked gr
        LEFT JOIN nodes gn ON gn.id = gr.group_id
        WHERE gr.rn = 1`;
        params.push(...groupParams);

        if (filterGroupScope && groupToScopeType && groupScopeId) {
          withSql += `
          AND (
            EXISTS (
              SELECT 1 FROM relationship_projections gsp
              WHERE gsp.source_node_id = gr.group_id AND gsp.type = ? AND gsp.target_node_id = ?
            )
            OR EXISTS (
              SELECT 1 FROM relationship_projections gsp
              WHERE gsp.target_node_id = gr.group_id AND gsp.type = ? AND gsp.source_node_id = ?
            )
          )`;
          params.push(groupToScopeType, groupScopeId, groupToScopeType, groupScopeId);
        }

        const canonicalBranch = canonical
          ? `WHEN (
               SELECT cg.canonical_id FROM nodes rn
               INNER JOIN canonical_groups cg
                 ON cg.title_key = lower(trim(
                   COALESCE(NULLIF(rn.title, ''), NULLIF(rn.alias, ''), 'Untitled')
                 ))
               WHERE rn.id = rmg.raw_group_id
               LIMIT 1
             ) IS NOT NULL
            THEN (
               SELECT cg.canonical_id FROM nodes rn
               INNER JOIN canonical_groups cg
                 ON cg.title_key = lower(trim(
                   COALESCE(NULLIF(rn.title, ''), NULLIF(rn.alias, ''), 'Untitled')
                 ))
               WHERE rn.id = rmg.raw_group_id
               LIMIT 1
            )`
          : "";

        withSql += `
      ),
      canonical_groups AS (
        SELECT title_key, group_id AS canonical_id
        FROM (
          SELECT lower(trim(title)) AS title_key, group_id,
            ROW_NUMBER() OVER (
              PARTITION BY lower(trim(title))
              ORDER BY sort_key ASC, title COLLATE NOCASE ASC, group_id ASC
            ) AS rn
          FROM group_headers
        ) WHERE rn = 1
      ),
      raw_member_group AS (
        SELECT sm.member_id,
          COALESCE(
            (
              SELECT sp.target_node_id FROM relationship_projections sp
              WHERE sp.source_node_id = sm.member_id AND sp.type = ?
              ORDER BY sp.id ASC LIMIT 1
            ),
            (
              SELECT sp.source_node_id FROM relationship_projections sp
              WHERE sp.target_node_id = sm.member_id AND sp.type = ?
              ORDER BY sp.id ASC LIMIT 1
            )
          ) AS raw_group_id
        FROM scoped_members sm
      ),
      resolved_member_group AS (
        SELECT rmg.member_id,
          CASE
            WHEN rmg.raw_group_id IS NULL THEN NULL
            WHEN EXISTS (SELECT 1 FROM group_headers gh WHERE gh.group_id = rmg.raw_group_id)
              THEN rmg.raw_group_id
            ${canonicalBranch}
            ELSE NULL
          END AS group_id
        FROM raw_member_group rmg
      ),
      member_with_group AS (
        SELECT sm.*,
               rmg.group_id AS group_id,
               gh.sort_key AS group_sort_key,
               gh.title AS group_title
        FROM scoped_members sm
        LEFT JOIN resolved_member_group rmg ON rmg.member_id = sm.member_id
        LEFT JOIN group_headers gh ON gh.group_id = rmg.group_id
      )`;
        params.push(memberToGroupType, memberToGroupType);
      }
    } else {
      withSql += `,
      member_with_group AS (
        SELECT sm.*, CAST(NULL AS TEXT) AS group_id, CAST(NULL AS REAL) AS group_sort_key,
               CAST(NULL AS TEXT) AS group_title
        FROM scoped_members sm
      )`;
    }

    const totalRow = this.db
      .prepare(`${withSql} SELECT COUNT(*) AS c FROM member_with_group`)
      .get(...params) as { c: number };
    const total = totalRow.c;

    const orderClauses: string[] = [];
    if (hasGroups) {
      orderClauses.push("CASE WHEN mwg.group_id IS NULL THEN 1 ELSE 0 END ASC");
      orderClauses.push("COALESCE(mwg.group_sort_key, 999) ASC");
      orderClauses.push("COALESCE(mwg.group_title, '') COLLATE NOCASE ASC");
    }
    if (defaultOrdered) {
      orderClauses.push(`CASE WHEN mwg."order" IS NULL THEN 1 ELSE 0 END ASC`);
      orderClauses.push(`mwg."order" ASC`);
    }
    orderClauses.push(`${titleSql} COLLATE NOCASE ASC`);
    orderClauses.push("mwg.id ASC");
    const orderBySql = `ORDER BY ${orderClauses.join(", ")}`;

    const { limit, offset } = parseLimitOffset(query);

    const selectSql = `${withSql}
      SELECT mwg.id, mwg.record_id, mwg.member_id AS source_node_id, mwg.set_id AS target_node_id,
             mwg.type, mwg.ordinal, mwg."order", mwg.priority,
             mwg.group_id AS resolved_group_id
      FROM member_with_group mwg
      LEFT JOIN nodes n ON n.id = mwg.member_id
      ${orderBySql}`;

    type Row = ProjectionRow & { resolved_group_id: string | null };
    let rows: Row[];
    if (limit === null) {
      rows = this.db.prepare(selectSql).all(...params) as Row[];
    } else {
      rows = this.db
        .prepare(`${selectSql} LIMIT ? OFFSET ?`)
        .all(...params, limit, offset) as Row[];
    }

    const relationships = this.mapProjectionRows(rows);
    const groupIds = hasGroups
      ? rows.map((row) =>
          typeof row.resolved_group_id === "string" && row.resolved_group_id
            ? row.resolved_group_id
            : null,
        )
      : [];

    return { relationships, groupIds, total };
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
    if (!isProfilingEnabled()) {
      return this.db.prepare(sql).all(...params) as T[];
    }
    const started = performance.now();
    try {
      return this.db.prepare(sql).all(...params) as T[];
    } finally {
      recordProfilingSample(
        "sql",
        performance.now() - started,
        `${truncateSql(sql)} (${params.length} params)`,
      );
    }
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
