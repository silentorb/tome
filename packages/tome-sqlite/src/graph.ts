import { Database, type SQLQueryBindings } from "bun:sqlite";
import { mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import type { Node, Properties, PropertyValue, Relationship } from "tome-graph-interfaces";
import type {
  GraphCounts,
  RelationshipProjectionRow,
  RelationshipPropertyCodec,
  RelationshipRecordRow,
  TomeQueryCache,
} from "tome-service-interfaces";
import {
  isProfilingEnabled,
  recordProfileSample,
  truncateSql,
} from "tome-service-interfaces";
import { migrateSchema } from "./schema-migrate";
import { DDL, PROMOTED_NODE_COLUMN_SET, SCHEMA_VERSION } from "./schema";

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

function parseJsonObject(raw: string): Properties {
  try {
    const v = JSON.parse(raw) as unknown;
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Properties;
  } catch {
    /* fall through */
  }
  return {};
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
  private updateRecordProps!: ReturnType<Database["prepare"]>;
  private insertProjection!: ReturnType<Database["prepare"]>;
  private updateProjectionProps!: ReturnType<Database["prepare"]>;

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

  private parseRelationshipProperties(raw: string): Properties {
    return this.propertyCodec.decode(parseJsonObject(raw));
  }

  private stringifyRelationshipProperties(properties: Properties): string {
    return JSON.stringify(this.propertyCodec.encode(properties));
  }

  private mapProjectionRow(row: {
    id: string;
    record_id: string;
    source_node_id: string;
    target_node_id: string;
    type: string;
    properties: string;
  }): Relationship {
    return {
      id: row.id,
      recordId: row.record_id,
      sourceNodeId: row.source_node_id,
      targetNodeId: row.target_node_id,
      type: row.type,
      properties: this.parseRelationshipProperties(row.properties),
    };
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
      `INSERT INTO relationship_records (id, node_a, node_b, composite_type, properties)
       VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`,
    );
    this.updateRecordProps = this.db.prepare(
      "UPDATE relationship_records SET properties = ? WHERE id = ?",
    );
    this.insertProjection = this.db.prepare(
      `INSERT INTO relationship_projections (id, record_id, source_node_id, target_node_id, type, properties)
       VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`,
    );
    this.updateProjectionProps = this.db.prepare(
      "UPDATE relationship_projections SET properties = ? WHERE id = ?",
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
    this.insertRecord.run(
      record.id,
      record.nodeA,
      record.nodeB,
      record.compositeType,
      this.stringifyRelationshipProperties(record.properties),
    );
    const existing = this.getRelationshipRecord(record.id);
    if (existing && Object.keys(record.properties).length > 0) {
      const merged = mergeProperties(existing.properties, record.properties);
      this.updateRecordProps.run(this.stringifyRelationshipProperties(merged), record.id);
    }
  }

  upsertRelationshipProjection(projection: RelationshipProjectionRow): void {
    this.insertProjection.run(
      projection.id,
      projection.recordId,
      projection.sourceNodeId,
      projection.targetNodeId,
      projection.type,
      this.stringifyRelationshipProperties(projection.properties),
    );
    const existing = this.getRelationship(projection.id);
    if (existing && Object.keys(projection.properties).length > 0) {
      const merged = mergeProperties(existing.properties, projection.properties);
      this.updateProjectionProps.run(this.stringifyRelationshipProperties(merged), projection.id);
    }
  }

  /** @deprecated Use upsertRelationshipProjection via sync expander. Kept for test helpers. */
  upsertRelationship(
    sourceNodeId: string,
    targetNodeId: string,
    type: string,
    properties: Properties = {},
  ): void {
    const id = relationshipId(sourceNodeId, type, targetNodeId);
    this.insertRecord.run(
      id,
      sourceNodeId,
      targetNodeId,
      type,
      this.stringifyRelationshipProperties(properties),
    );
    this.insertProjection.run(
      id,
      id,
      sourceNodeId,
      targetNodeId,
      type,
      this.stringifyRelationshipProperties(properties),
    );
    const existing = this.getRelationship(id);
    if (existing && Object.keys(properties).length > 0) {
      const merged = mergeProperties(existing.properties, properties);
      this.updateProjectionProps.run(this.stringifyRelationshipProperties(merged), id);
    }
  }

  mergeRelationshipProperties(id: string, properties: Properties): void {
    const existing = this.getRelationship(id);
    if (!existing) return;
    const merged = mergeProperties(existing.properties, properties);
    this.updateProjectionProps.run(this.stringifyRelationshipProperties(merged), id);
    if (existing.recordId) {
      this.updateRecordProps.run(this.stringifyRelationshipProperties(merged), existing.recordId);
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
    const row = this.db
      .prepare(
        "SELECT id, node_a, node_b, composite_type, properties FROM relationship_records WHERE id = ?",
      )
      .get(id) as
      | {
          id: string;
          node_a: string;
          node_b: string;
          composite_type: string;
          properties: string;
        }
      | undefined;
    if (!row) return null;
    return {
      id: row.id,
      nodeA: row.node_a,
      nodeB: row.node_b,
      compositeType: row.composite_type,
      properties: this.parseRelationshipProperties(row.properties),
    };
  }

  getRelationship(id: string): Relationship | null {
    const row = this.db
      .prepare(
        `SELECT id, record_id, source_node_id, target_node_id, type, properties
         FROM relationship_projections WHERE id = ?`,
      )
      .get(id) as
      | {
          id: string;
          record_id: string;
          source_node_id: string;
          target_node_id: string;
          type: string;
          properties: string;
        }
      | undefined;
    if (!row) return null;
    return this.mapProjectionRow(row);
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
            `SELECT id, record_id, source_node_id, target_node_id, type, properties
             FROM relationship_projections WHERE source_node_id = ? AND type = ? ORDER BY id`,
          )
          .all(sourceNodeId, type) as {
          id: string;
          record_id: string;
          source_node_id: string;
          target_node_id: string;
          type: string;
          properties: string;
        }[])
      : (this.db
          .prepare(
            `SELECT id, record_id, source_node_id, target_node_id, type, properties
             FROM relationship_projections WHERE source_node_id = ? ORDER BY type, id`,
          )
          .all(sourceNodeId) as {
          id: string;
          record_id: string;
          source_node_id: string;
          target_node_id: string;
          type: string;
          properties: string;
        }[]);

    return rows.map((row) => this.mapProjectionRow(row));
  }

  listRelationshipsToTarget(targetNodeId: string, type?: string): Relationship[] {
    const rows = type
      ? (this.db
          .prepare(
            `SELECT id, record_id, source_node_id, target_node_id, type, properties
             FROM relationship_projections WHERE target_node_id = ? AND type = ? ORDER BY id`,
          )
          .all(targetNodeId, type) as {
          id: string;
          record_id: string;
          source_node_id: string;
          target_node_id: string;
          type: string;
          properties: string;
        }[])
      : (this.db
          .prepare(
            `SELECT id, record_id, source_node_id, target_node_id, type, properties
             FROM relationship_projections WHERE target_node_id = ? ORDER BY id`,
          )
          .all(targetNodeId) as {
          id: string;
          record_id: string;
          source_node_id: string;
          target_node_id: string;
          type: string;
          properties: string;
        }[]);

    return rows.map((row) => this.mapProjectionRow(row));
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
      recordProfileSample(
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
