import type { DatabaseColumnDef } from "../database-view";
import type { ViewsFile } from "../content/views-file";

/** Apply optional section columnOrder override to default column keys. */
export function applyColumnOrder(defaultOrder: string[], columnOrder?: string[]): string[] {
  if (!columnOrder?.length) return defaultOrder;

  const defaultSet = new Set(defaultOrder);
  const ordered: string[] = [];
  const seen = new Set<string>();

  for (const key of columnOrder) {
    if (defaultSet.has(key) && !seen.has(key)) {
      ordered.push(key);
      seen.add(key);
    }
  }

  for (const key of defaultOrder) {
    if (!seen.has(key)) {
      ordered.push(key);
    }
  }

  return ordered;
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

export function getSectionColumnOrder(
  views: ViewsFile,
  nodeId: string,
  sectionKey: string,
): string[] | undefined {
  return views.nodes[nodeId]?.sections[sectionKey]?.columnOrder;
}

export function applySectionColumnOrder(
  defaultOrder: string[],
  columnDefs: DatabaseColumnDef[] | undefined,
  views: ViewsFile,
  nodeId: string,
  sectionKey: string,
): { columns: string[]; columnDefs: DatabaseColumnDef[] | undefined } {
  const columnOrder = getSectionColumnOrder(views, nodeId, sectionKey);
  const columns = applyColumnOrder(defaultOrder, columnOrder);
  if (!columnDefs?.length) {
    return { columns, columnDefs };
  }
  return {
    columns,
    columnDefs: reorderColumnDefs(columnDefs, columns),
  };
}
