import type { Properties, Relationship } from "../graph";
import { relationshipId } from "../graph";
import { normalizeRelationshipType } from "../relation-type";

export const RELATIONSHIPS_FILE_VERSION = 3;

/**
 * A relationship is an ordered tuple `(a, b)`. The positions carry no built-in
 * meaning (not source/target): the edge type assigns a per-position value to
 * each index (see `RelationshipTypeDefinition.perspectives`). Relative semantics
 * come from tuple order + the type registry, never from lexicographic node order.
 */
export interface RelationshipEntry {
  a: string;
  b: string;
  type: string;
  /** When true, entry is kept in content but excluded from SQLite cache sync. */
  archived?: boolean;
  properties?: Properties;
}

export interface RelationshipsFile {
  version: number;
  relationships: RelationshipEntry[];
}

/** True when `entry` connects `x` and `y` in either tuple position. */
export function connectsEndpoints(entry: RelationshipEntry, x: string, y: string): boolean {
  return (entry.a === x && entry.b === y) || (entry.a === y && entry.b === x);
}

export function relationshipRecordId(a: string, b: string, type: string): string {
  return `${a}:${b}:${normalizeRelationshipType(type)}`;
}

export function parseRelationshipsFile(raw: string): RelationshipsFile {
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

  const entries: RelationshipEntry[] = [];
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
      entries.push({
        a: row.a,
        b: row.b,
        type: normalizeRelationshipType(row.type),
        ...(archived ? { archived } : {}),
        ...(properties ? { properties } : {}),
      });
      continue;
    }

    throw new Error("relationships.json: each relationship requires a, b, type");
  }

  return { version, relationships: entries };
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

export function serializeRelationshipsFile(file: RelationshipsFile): string {
  const normalized: RelationshipsFile = {
    version: file.version,
    relationships: file.relationships.map((r) => ({
      a: r.a,
      b: r.b,
      type: r.type,
      ...(r.archived === true ? { archived: true } : {}),
      ...(r.properties && Object.keys(r.properties).length > 0 ? { properties: r.properties } : {}),
    })),
  };
  return `${JSON.stringify(normalized, null, 2)}\n`;
}
