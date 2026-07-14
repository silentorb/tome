import type { Properties, Relationship } from "tome-graph-interfaces";
import { relationshipId } from "../relationship-id";
import { isAssociationId, normalizeAssociationId } from "./associations-file";

/** Conceptual on-disk layout version (sharded one-file-per-edge trees). */
export const RELATIONSHIPS_FILE_VERSION = 4;

/**
 * A relationship is an ordered tuple `(a, b)`. The positions carry no built-in
 * meaning (not source/target): the edge type assigns a per-position value to
 * each index (see `AssociationDefinition.perspectives`). Relative semantics
 * come from tuple order + the type registry, never from lexicographic node order.
 *
 * Archive status is filesystem location (`relationships/` vs
 * `relationships/archive/`), not a field on the entry.
 */
export interface RelationshipEntry {
  a: string;
  b: string;
  type: string;
  properties?: Properties;
}

/** In-memory aggregate of relationship entries (not a single on-disk file). */
export interface RelationshipsFile {
  version: number;
  relationships: RelationshipEntry[];
}

/** True when `entry` connects `x` and `y` in either tuple position. */
export function connectsEndpoints(entry: RelationshipEntry, x: string, y: string): boolean {
  return (entry.a === x && entry.b === y) || (entry.a === y && entry.b === x);
}

export function relationshipRecordId(a: string, b: string, type: string): string {
  return `${a}:${b}:${normalizeAssociationId(type)}`;
}

export function parseRelationshipEntry(raw: string, pathHint = "relationship"): RelationshipEntry {
  const data = JSON.parse(raw) as unknown;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`${pathHint}: root must be an object`);
  }
  const row = data as Record<string, unknown>;
  if (typeof row.a !== "string" || typeof row.b !== "string" || typeof row.type !== "string") {
    throw new Error(`${pathHint}: requires a, b, type`);
  }
  const type = normalizeAssociationId(row.type);
  if (!isAssociationId(type)) {
    throw new Error(`${pathHint}: relationship type "${row.type}" must be a ULID`);
  }
  const properties =
    row.properties && typeof row.properties === "object" && !Array.isArray(row.properties)
      ? (row.properties as Properties)
      : undefined;
  return {
    a: row.a,
    b: row.b,
    type,
    ...(properties ? { properties } : {}),
  };
}

export function serializeRelationshipEntry(entry: RelationshipEntry): string {
  const normalized: RelationshipEntry = {
    a: entry.a,
    b: entry.b,
    type: entry.type,
    ...(entry.properties && Object.keys(entry.properties).length > 0
      ? { properties: entry.properties }
      : {}),
  };
  return `${JSON.stringify(normalized, null, 2)}\n`;
}

/**
 * Parse legacy monolithic `data/relationships.json` (v3) for migration only.
 * Accepts optional `archived` on entries (ignored by callers that place by path).
 */
export function parseLegacyRelationshipsFile(raw: string): {
  version: number;
  relationships: Array<RelationshipEntry & { archived?: boolean }>;
} {
  const data = JSON.parse(raw) as unknown;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("relationships.json: root must be an object");
  }
  const obj = data as Record<string, unknown>;
  const version = obj.version;
  const relationships = obj.relationships ?? obj.connections;
  if (typeof version !== "number") {
    throw new Error("relationships.json: version is required");
  }
  if (!Array.isArray(relationships)) {
    throw new Error("relationships.json: relationships must be an array");
  }

  const entries: Array<RelationshipEntry & { archived?: boolean }> = [];
  for (const item of relationships) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("relationships.json: each relationship must be an object");
    }
    const row = item as Record<string, unknown>;
    const properties =
      row.properties && typeof row.properties === "object" && !Array.isArray(row.properties)
        ? (row.properties as Properties)
        : undefined;
    const archived = row.archived === true ? true : undefined;

    if (typeof row.a === "string" && typeof row.b === "string" && typeof row.type === "string") {
      const type = normalizeAssociationId(row.type);
      if (!isAssociationId(type)) {
        throw new Error(
          `relationships.json: relationship type "${row.type}" must be a ULID`,
        );
      }
      entries.push({
        a: row.a,
        b: row.b,
        type,
        ...(archived ? { archived } : {}),
        ...(properties ? { properties } : {}),
      });
      continue;
    }

    throw new Error("relationships.json: each relationship requires a, b, type");
  }

  return { version, relationships: entries };
}

/** @deprecated Prefer {@link parseRelationshipEntry} / tree scan. Kept for migration callers. */
export function parseRelationshipsFile(raw: string): RelationshipsFile {
  const legacy = parseLegacyRelationshipsFile(raw);
  return {
    version: RELATIONSHIPS_FILE_VERSION,
    relationships: legacy.relationships.map(({ archived: _a, ...rest }) => rest),
  };
}

/**
 * Directed view of an entry from its authored tuple order: index 0 is the
 * projection source, index 1 the target. The projection `type` is the raw
 * composite; perspective expansion happens in relationship-sync-expand.
 */
export function relationshipFromEntry(entry: RelationshipEntry): Relationship {
  const type = entry.type;
  return {
    id: relationshipId(entry.a, type, entry.b),
    recordId: relationshipRecordId(entry.a, entry.b, type),
    sourceNodeId: entry.a,
    targetNodeId: entry.b,
    type,
    properties: entry.properties ?? {},
  };
}

/** Build an entry preserving the relationship's directed order (source -> a, target -> b). */
export function entryFromRelationship(relationship: Relationship): RelationshipEntry {
  return {
    a: relationship.sourceNodeId,
    b: relationship.targetNodeId,
    type: relationship.type,
    ...(Object.keys(relationship.properties).length > 0
      ? { properties: relationship.properties }
      : {}),
  };
}

/** @deprecated Monolithic serialize; prefer {@link serializeRelationshipEntry}. */
export function serializeRelationshipsFile(file: RelationshipsFile): string {
  const normalized = {
    version: file.version,
    relationships: file.relationships.map((r) => ({
      a: r.a,
      b: r.b,
      type: r.type,
      ...(r.properties && Object.keys(r.properties).length > 0 ? { properties: r.properties } : {}),
    })),
  };
  return `${JSON.stringify(normalized, null, 2)}\n`;
}
