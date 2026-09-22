import type { Relationship } from "tome-graph-interfaces";
import type { DatabaseColumnDef } from "./database-view";
import type { RelationLink } from "./relation-link";
import { relationType } from "tome-flatfile";
import type { EvalRow } from "./row-sort";
import {
  filterRelationshipsByRowDatabaseContext,
  listRelationshipsForComposite,
  otherEndpoint,
  rowBelongsToDatabase,
} from "./relationship-traverse";
import {
  loadAssociationsFromContent,
  normalizeRelationshipType,
  parseProjectionType,
  projectionTypeForEndpoint,
  isSymmetricAssociation,
} from "tome-flatfile";
import type { AssociationsFile } from "tome-flatfile";
import type {
  SetMemberRelationFieldLink,
  SetMemberRelationFieldSelect,
} from "tome-service-interfaces";
import {
  listRelationshipsFromSource,
  type RelationshipReadStore,
} from "./graph-store/relationship-read";

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

function scopeForRow(
  db: RelationshipReadStore,
  rowId: string,
  databaseId: string,
  relationships: Relationship[],
  contentDir?: string,
): Relationship[] {
  return filterRelationshipsByRowDatabaseContext(db, rowId, databaseId, relationships, contentDir);
}

/** Projection types that share direction with `connectionType` (symmetric associations). */
function acceptedOutgoingTypes(
  connectionType: string,
  registry: AssociationsFile | null,
): Set<string> {
  const normalized = normalizeRelationshipType(connectionType);
  const accepted = new Set([normalized]);
  if (!registry) return accepted;
  const parsed = parseProjectionType(connectionType);
  if (!parsed) return accepted;
  const def = registry.associations[parsed.associationId];
  if (!def || !isSymmetricAssociation(def)) return accepted;
  accepted.add(
    normalizeRelationshipType(projectionTypeForEndpoint(parsed.associationId, 0)),
  );
  accepted.add(
    normalizeRelationshipType(projectionTypeForEndpoint(parsed.associationId, 1)),
  );
  return accepted;
}

/** Keep projections emitted from this row's local perspective (source + type). */
function filterByOutgoingPerspective(
  nodeId: string,
  connectionType: string,
  relationships: Relationship[],
  registry: AssociationsFile | null,
): Relationship[] {
  const accepted = acceptedOutgoingTypes(connectionType, registry);
  return relationships.filter(
    (relationship) =>
      relationship.sourceNodeId === nodeId &&
      accepted.has(normalizeRelationshipType(relationship.type)),
  );
}

export function listRelationConnectionsForRow(
  db: RelationshipReadStore,
  nodeId: string,
  connectionType: string,
  databaseId: string,
  compositeType?: string,
  contentDir?: string,
): Relationship[] {
  if (!rowBelongsToDatabase(db, nodeId, databaseId, contentDir)) return [];
  const registry = contentDir ? loadAssociationsFromContent(contentDir) : null;

  if (compositeType) {
    const byComposite = listRelationshipsForComposite(db, nodeId, compositeType);
    const compositeFiltered = scopeForRow(
      db,
      nodeId,
      databaseId,
      filterByOutgoingPerspective(nodeId, connectionType, byComposite, registry),
      contentDir,
    );
    if (compositeFiltered.length > 0) return compositeFiltered;
  }

  const outgoing = listRelationshipsFromSource(db, nodeId, connectionType);
  const symmetric =
    registry &&
    (() => {
      const parsed = parseProjectionType(connectionType);
      if (!parsed) return [] as Relationship[];
      const def = registry.associations[parsed.associationId];
      if (!def || !isSymmetricAssociation(def)) return [] as Relationship[];
      const otherIndex: 0 | 1 = parsed.endpointIndex === 0 ? 1 : 0;
      return listRelationshipsFromSource(
        db,
        nodeId,
        projectionTypeForEndpoint(parsed.associationId, otherIndex),
      );
    })();
  return scopeForRow(
    db,
    nodeId,
    databaseId,
    [...outgoing, ...(symmetric ?? [])],
    contentDir,
  );
}

function linksFromRelationships(
  db: RelationshipReadStore,
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
 * Build Select-stage specs for relation columns (including symmetric partner types).
 * Projection type strings must match SQLite `relationship_projections.type` casing.
 */
export function relationFieldSelectsFromColumnDefs(
  columnDefs: readonly DatabaseColumnDef[],
  contentDir?: string,
): SetMemberRelationFieldSelect[] {
  const registry = contentDir ? loadAssociationsFromContent(contentDir) : null;
  const out: SetMemberRelationFieldSelect[] = [];
  for (const col of columnDefs) {
    if (col.type !== "relation") continue;
    const type = (col.relationType ?? relationType(col.name)).trim();
    if (!type) continue;
    const projectionTypes = new Set<string>([type]);
    if (registry) {
      const parsed = parseProjectionType(type);
      if (parsed) {
        const def = registry.associations[parsed.associationId];
        if (def && isSymmetricAssociation(def)) {
          projectionTypes.add(projectionTypeForEndpoint(parsed.associationId, 0));
          projectionTypes.add(projectionTypeForEndpoint(parsed.associationId, 1));
        }
      }
    }
    const select: SetMemberRelationFieldSelect = {
      column: col.key,
      projectionTypes: [...projectionTypes],
    };
    const composite = col.relationshipCompositeType?.trim();
    if (composite) select.compositeType = composite;
    out.push(select);
  }
  return out;
}

/** Apply window SQL relation payloads onto eval rows (parallel arrays). */
export function applyRelationFieldsToEvalRows(
  rows: EvalRow[],
  relationFieldsByRow: readonly Record<string, SetMemberRelationFieldLink[]>[] | undefined,
): void {
  if (!relationFieldsByRow || relationFieldsByRow.length === 0) return;
  const n = Math.min(rows.length, relationFieldsByRow.length);
  for (let i = 0; i < n; i++) {
    const row = rows[i]!;
    const fields = relationFieldsByRow[i]!;
    if (!row.relationCells) row.relationCells = {};
    for (const [key, links] of Object.entries(fields)) {
      const relationLinks: RelationLink[] = links.map((link) => ({
        targetId: link.targetId,
        title: link.title,
      }));
      row.relationCells[key] = relationLinks;
      if (relationLinks.length > 0) {
        row.cells[key] = formatRelationCell(relationLinks);
      }
    }
  }
}

/**
 * Fill relation-type table cells from outgoing graph relationships (not IS_A properties).
 * Flatfile / legacy path — SQLite window paths prefer {@link applyRelationFieldsToEvalRows}.
 */
export function hydrateRelationCellsForRows(
  db: RelationshipReadStore,
  databaseId: string,
  columnDefs: DatabaseColumnDef[],
  rows: EvalRow[],
  contentDir?: string,
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
        col.relationshipCompositeType,
        contentDir,
      );
      const links = linksFromRelationships(db, row.nodeId, relationships);
      row.relationCells[col.key] = links;
      if (links.length > 0) {
        row.cells[col.key] = formatRelationCell(links);
      }
    }
  }
}
