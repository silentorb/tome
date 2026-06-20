import type { GraphDatabase, Relationship } from "./graph";
import type { DatabaseColumnDef } from "./database-view";
import type { RelationLink } from "./relation-link";
import {
  isIncludesPerspectiveSlug,
  isMigratableToIncludesStorageType,
  TAXONOMY_INSPIRATION_PERSPECTIVES,
} from "./includes-relationship";
import { relationType } from "./relation-type";
import type { EvalRow } from "./row-sort";
import {
  filterRelationshipsByRowDatabaseContext,
  listIncludesIncident,
  listRelationshipsForComposite,
  listRelationshipsToDatabaseMembers,
  otherEndpoint,
  rowBelongsToDatabase,
} from "./relationship-traverse";
import { compositeTypeForPerspectives } from "./content/relationship-types-file";
import { normalizeRelationshipType } from "./relation-type";

function titleFromProperties(properties: Record<string, unknown>): string {
  const title = properties.title;
  if (typeof title === "string" && title.trim()) return title.trim();
  return "Untitled";
}

function ordinalFromProperties(properties: Record<string, unknown>): number {
  const raw = properties.ordinal;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const parsed = Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function shouldUseIncludesLookup(connectionType: string): boolean {
  if (TAXONOMY_INSPIRATION_PERSPECTIVES.has(connectionType)) return false;
  return isIncludesPerspectiveSlug(connectionType);
}

function scopeForRow(
  db: GraphDatabase,
  rowId: string,
  databaseId: string,
  relationships: Relationship[],
): Relationship[] {
  return filterRelationshipsByRowDatabaseContext(db, rowId, databaseId, relationships);
}

/** Keep projections emitted from this row's local perspective (source + type). */
function filterByOutgoingPerspective(
  nodeId: string,
  connectionType: string,
  relationships: Relationship[],
): Relationship[] {
  const normalized = normalizeRelationshipType(connectionType);
  return relationships.filter(
    (relationship) =>
      relationship.sourceNodeId === nodeId &&
      normalizeRelationshipType(relationship.type) === normalized,
  );
}

export function listRelationConnectionsForRow(
  db: GraphDatabase,
  nodeId: string,
  connectionType: string,
  databaseId: string,
  targetDatabaseId?: string,
): Relationship[] {
  if (!rowBelongsToDatabase(db, nodeId, databaseId)) return [];

  if (targetDatabaseId && shouldUseIncludesLookup(connectionType)) {
    const byIncludes = listIncludesIncident(db, nodeId, targetDatabaseId);
    const includesFiltered = scopeForRow(db, nodeId, databaseId, byIncludes);
    if (includesFiltered.length > 0) return includesFiltered;
  }

  if (targetDatabaseId && targetDatabaseId !== databaseId) {
    const byTargetDb = listRelationshipsToDatabaseMembers(db, nodeId, targetDatabaseId);
    const filtered = scopeForRow(db, nodeId, databaseId, byTargetDb);
    if (filtered.length > 0) return filtered;
  }

  if (targetDatabaseId && !TAXONOMY_INSPIRATION_PERSPECTIVES.has(connectionType)) {
    const compositeType = compositeTypeForPerspectives(
      connectionType,
      inferInverseRelationType(connectionType),
    );
    if (!isMigratableToIncludesStorageType(compositeType)) {
      const byComposite = listRelationshipsForComposite(db, nodeId, compositeType);
      const compositeFiltered = scopeForRow(
        db,
        nodeId,
        databaseId,
        filterByOutgoingPerspective(nodeId, connectionType, byComposite),
      );
      if (compositeFiltered.length > 0) return compositeFiltered;
    }
  }

  const outgoing = db.listRelationshipsFromSource(nodeId, connectionType);
  return scopeForRow(db, nodeId, databaseId, outgoing);
}

function inferInverseRelationType(localType: string): string {
  switch (localType) {
    case "scenes":
      return "location";
    case "location":
      return "scenes";
    case "parents":
      return "children";
    case "children":
      return "parents";
    default:
      return localType;
  }
}

function linksFromRelationships(
  db: GraphDatabase,
  nodeId: string,
  relationships: Relationship[],
): RelationLink[] {
  const sorted = [...relationships].sort(
    (a, b) => ordinalFromProperties(a.properties) - ordinalFromProperties(b.properties),
  );
  const links: RelationLink[] = [];
  for (const relationship of sorted) {
    const targetId = otherEndpoint(relationship, nodeId);
    const target = db.getNode(targetId);
    const title = target ? titleFromProperties(target.properties) : "Untitled";
    links.push({ targetId, title });
  }
  return links;
}

function formatRelationCell(links: RelationLink[]): string {
  return links.map((link) => link.title).join(", ");
}

/**
 * Fill relation-type table cells from outgoing graph relationships (not IS_A properties).
 */
export function hydrateRelationCellsForRows(
  db: GraphDatabase,
  databaseId: string,
  columnDefs: DatabaseColumnDef[],
  rows: EvalRow[],
): void {
  const relationColumns = columnDefs.filter((col) => col.type === "relation");
  if (relationColumns.length === 0) return;

  for (const row of rows) {
    if (!row.relationCells) row.relationCells = {};
    for (const col of relationColumns) {
      const type = col.relationType ?? relationType(col.name);
      const relationships = listRelationConnectionsForRow(
        db,
        row.nodeId,
        type,
        databaseId,
        col.targetDatabaseId,
      );
      const links = linksFromRelationships(db, row.nodeId, relationships);
      row.relationCells[col.key] = links;
      if (links.length > 0) {
        row.cells[col.key] = formatRelationCell(links);
      }
    }
  }
}
