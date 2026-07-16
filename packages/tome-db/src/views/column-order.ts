import type { DatabaseColumnDef } from "../database-view";
import type { ViewsFile } from "tome-flatfile";
import { generatedViewForRelationship, viewsForRelationship } from "./index";

/**
 * Apply optional additive properties allowlist.
 * Absent/empty → default order (all visible).
 * Present → only listed keys that exist in defaultOrder, in listed order (no append).
 */
export function applyViewProperties(
  defaultOrder: string[],
  properties?: string[],
): string[] {
  if (!properties?.length) return defaultOrder;

  const defaultSet = new Set(defaultOrder);
  const ordered: string[] = [];
  const seen = new Set<string>();

  for (const key of properties) {
    if (defaultSet.has(key) && !seen.has(key)) {
      ordered.push(key);
      seen.add(key);
    }
  }

  return ordered;
}

/** @deprecated Use applyViewProperties */
export function applyColumnOrder(defaultOrder: string[], columnOrder?: string[]): string[] {
  return applyViewProperties(defaultOrder, columnOrder);
}

/** Reorder column defs to match a column key order. */
export function reorderColumnDefs<T extends { key: string }>(
  defs: T[],
  columnOrder: string[],
): T[] {
  const byKey = new Map(defs.map((def) => [def.key, def]));
  const ordered: T[] = [];
  const seen = new Set<string>();

  for (const key of columnOrder) {
    const def = byKey.get(key);
    if (def && !seen.has(key)) {
      ordered.push(def);
      seen.add(key);
    }
  }

  for (const def of defs) {
    if (!seen.has(def.key)) {
      ordered.push(def);
    }
  }

  return ordered;
}

/** Resolve properties allowlist for a node+association (generated shared, or first custom). */
export function getRelationshipProperties(
  views: ViewsFile,
  nodeId: string,
  association: string,
): string[] | undefined {
  const generated = generatedViewForRelationship(views, nodeId, association);
  if (generated?.properties?.length) return generated.properties;
  const custom = viewsForRelationship(views, nodeId, association);
  for (const view of custom) {
    if (view.properties?.length) return view.properties;
  }
  return undefined;
}

/** @deprecated Use getRelationshipProperties */
export function getSectionColumnOrder(
  views: ViewsFile,
  nodeId: string,
  association: string,
): string[] | undefined {
  return getRelationshipProperties(views, nodeId, association);
}

export function applySectionColumnOrder(
  defaultOrder: string[],
  columnDefs: DatabaseColumnDef[] | undefined,
  views: ViewsFile,
  nodeId: string,
  association: string,
  activeProperties?: string[],
): { columns: string[]; columnDefs: DatabaseColumnDef[] | undefined } {
  const properties =
    activeProperties !== undefined
      ? activeProperties
      : getRelationshipProperties(views, nodeId, association);
  const columns = applyViewProperties(defaultOrder, properties);
  if (!columnDefs?.length) {
    return { columns, columnDefs };
  }
  const visibleDefs = columnDefs.filter((def) => columns.includes(def.key));
  return {
    columns,
    columnDefs: reorderColumnDefs(visibleDefs, columns),
  };
}
