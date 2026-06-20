import type { Properties, Relationship } from "../graph";
import { relationshipId } from "../graph";
import { normalizeRelationshipType } from "../relation-type";

export const RELATIONSHIPS_FILE_VERSION = 2;

export interface RelationshipEntry {
  a: string;
  b: string;
  type: string;
  /** Required for directed (non-bidirectional) types — the node id that is the source. */
  directedFrom?: string;
  /** When true, entry is kept in content but excluded from SQLite cache sync. */
  archived?: boolean;
  properties?: Properties;
}

export interface RelationshipsFile {
  version: number;
  relationships: RelationshipEntry[];
}

export function sortEndpoints(source: string, target: string): { a: string; b: string } {
  return source < target ? { a: source, b: target } : { a: target, b: source };
}

export function relationshipRecordId(a: string, b: string, type: string): string {
  const { a: na, b: nb } = sortEndpoints(a, b);
  return `${na}:${nb}:${normalizeRelationshipType(type)}`;
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
      const { a, b } = sortEndpoints(row.a, row.b);
      const directedFrom =
        typeof row.directedFrom === "string" && row.directedFrom.trim()
          ? row.directedFrom.trim()
          : undefined;
      entries.push({
        a,
        b,
        type: normalizeRelationshipType(row.type),
        ...(directedFrom ? { directedFrom } : {}),
        ...(archived ? { archived } : {}),
        ...(properties ? { properties } : {}),
      });
      continue;
    }

    // v1 compat: { source, target, label }
    const source = row.source;
    const target = row.target;
    const legacyLabel = row.label ?? row.type;
    if (
      typeof source === "string" &&
      typeof target === "string" &&
      typeof legacyLabel === "string"
    ) {
      const { a, b } = sortEndpoints(source, target);
      entries.push({
        a,
        b,
        type: normalizeRelationshipType(legacyLabel),
        directedFrom: source,
        ...(archived ? { archived } : {}),
        ...(properties ? { properties } : {}),
      });
      continue;
    }

    throw new Error("relationships.json: each relationship requires a, b, type (or v1 source, target, label)");
  }

  return { version, relationships: entries };
}

export function relationshipFromEntry(entry: RelationshipEntry): Relationship {
  if (!entry.directedFrom) {
    throw new Error("relationship entry requires directedFrom");
  }
  const sourceNodeId = entry.directedFrom;
  const targetNodeId = entry.a === sourceNodeId ? entry.b : entry.a;
  const type = entry.type;
  return {
    id: relationshipId(sourceNodeId, type, targetNodeId),
    recordId: relationshipRecordId(entry.a, entry.b, type),
    sourceNodeId,
    targetNodeId,
    type,
    properties: entry.properties ?? {},
  };
}

export function entryFromRelationship(relationship: Relationship): RelationshipEntry {
  const { a, b } = sortEndpoints(relationship.sourceNodeId, relationship.targetNodeId);
  return {
    a,
    b,
    type: relationship.type,
    directedFrom: relationship.sourceNodeId,
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
      ...(r.directedFrom ? { directedFrom: r.directedFrom } : {}),
      ...(r.archived === true ? { archived: true } : {}),
      ...(r.properties && Object.keys(r.properties).length > 0 ? { properties: r.properties } : {}),
    })),
  };
  return `${JSON.stringify(normalized, null, 2)}\n`;
}
