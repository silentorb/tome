import type { GraphDatabase } from "tome-sqlite";
import {
  loadAssociationsFromContent,
  normalizeAssociationId,
  getTableSchema,
  loadTableSchemasFromContent,
  relationColumns,
  projectionTypeForRelationColumn,
  relationColumnCompositeType,
} from "tome-flatfile";
import { projectionTypeForHostTable } from "../association-endpoints";

export function titleFromProperties(properties: Record<string, unknown>): string {
  const title = properties.title;
  if (typeof title === "string" && title.trim()) return title.trim();
  const alias = properties.alias;
  if (typeof alias === "string" && alias.trim()) return alias.trim();
  return "Untitled";
}

export function numericSortKey(raw: unknown, fallback: number): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const parsed = Number.parseFloat(String(raw ?? ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Resolve the member→target projection for a relation composite on a type table. */
export function memberLinkPerspective(
  typeDatabaseId: string,
  compositeType: string,
  contentDir: string,
  label: string,
): string {
  const registry = loadAssociationsFromContent(contentDir);
  const composite = normalizeAssociationId(compositeType);
  const schema = getTableSchema(loadTableSchemasFromContent(contentDir), typeDatabaseId);
  if (schema) {
    for (const col of relationColumns(schema)) {
      if (col.type !== "relation") continue;
      if (relationColumnCompositeType(col) !== composite) continue;
      return projectionTypeForRelationColumn(registry, typeDatabaseId, col);
    }
  }
  const def = registry.associations[composite];
  if (!def) {
    throw new Error(`${label}: unknown composite "${compositeType}"`);
  }
  const perspective = projectionTypeForHostTable(def, composite, typeDatabaseId);
  if (!perspective) {
    throw new Error(`${label}: composite "${compositeType}" has no endpoint for type database`);
  }
  return perspective;
}

export function nodeTitle(db: GraphDatabase, nodeId: string): string {
  const vertex = db.getNode(nodeId);
  return vertex ? titleFromProperties(vertex.properties) : "Untitled";
}
