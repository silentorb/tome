import type {
  DatabaseColumnDef,
  TableRowsQuery,
  ViewSortSpec,
} from "tome-graph-interfaces";
import type { TomeQueryCache } from "tome-service-interfaces";
import {
  getQueryCache,
  type RelationshipReadStore,
} from "./graph-store/relationship-read";
import {
  planDynSortIndexes,
} from "./dynamic-properties/expression-index";
import { loadDynamicColumnSets } from "./dynamic-properties/overlay";
import { parseDimensionIdFromColumnKey } from "./dynamic-properties/registry";

/**
 * True when table `q` (name filter / relevance) is set — deferred exploration hold
 * for next-level Tome search; keeps the full legacy materialize path.
 */
export function tableRowsQueryUsesDeferredSearch(query?: TableRowsQuery): boolean {
  return Boolean(query?.q?.trim());
}

/** True when any sort column is a dynamic property / column-set key. */
export function tableRowsQueryUsesDynSort(
  sorts: readonly ViewSortSpec[] | undefined,
  columnDefs: readonly DatabaseColumnDef[],
  options?: {
    store?: RelationshipReadStore;
    ownerId?: string;
    contentDir?: string;
  },
): boolean {
  if (!sorts?.length) return false;
  const dynKeys = new Set(
    columnDefs.filter((def) => def.source === "dynamic").map((def) => def.key),
  );
  if (sorts.some((sort) => dynKeys.has(sort.column))) return true;
  const store = options?.store;
  const ownerId = options?.ownerId;
  if (!store || !ownerId) return false;
  const columnSets = loadDynamicColumnSets(store, ownerId, options?.contentDir);
  return sorts.some((sort) => {
    const col = sort.column.trim();
    if (!col) return false;
    return columnSets.some(
      (set) => parseDimensionIdFromColumnKey(set.columnKeyPattern, col) != null,
    );
  });
}

/**
 * Dyn sorts that cannot use expression indexes (unknown resolver / unparseable column-set key).
 * Fixed and indexed column-set dyn sorts return false when plans succeed.
 */
export function tableRowsQueryUsesUnresolvedDynSort(
  store: RelationshipReadStore,
  ownerId: string,
  sorts: readonly ViewSortSpec[] | undefined,
  columnDefs: readonly DatabaseColumnDef[],
  contentDir?: string,
): boolean {
  if (
    !tableRowsQueryUsesDynSort(sorts, columnDefs, { store, ownerId, contentDir })
  ) {
    return false;
  }
  const dynKeys = new Set(
    columnDefs.filter((def) => def.source === "dynamic").map((def) => def.key),
  );
  const plans = planDynSortIndexes(store, ownerId, sorts, dynKeys, contentDir);
  return plans === null;
}

function isSafeSqlPropertyKey(key: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key);
}

/**
 * Sorts that cannot be expressed in the Items SQL window (unknown / unsafe keys).
 * Dyn sorts are checked separately via {@link tableRowsQueryUsesUnresolvedDynSort}.
 */
export function tableRowsQueryUsesNonExpressibleSort(
  sorts: readonly ViewSortSpec[] | undefined,
  columnDefs: readonly DatabaseColumnDef[],
): boolean {
  if (!sorts?.length) return false;
  const byKey = new Map(columnDefs.map((def) => [def.key, def]));
  for (const sort of sorts) {
    const col = sort.column.trim();
    if (!col) continue;
    if (col === "name") continue;
    if (!isSafeSqlPropertyKey(col)) return true;
    const def = byKey.get(col);
    if (def?.source === "dynamic") continue; // gated elsewhere
    if (def?.type === "relation") {
      if (!def.relationType?.trim()) return true;
      continue;
    }
    // Edge scalar / EAV / schema scalar — expressible via edge ORDER BY.
  }
  return false;
}

/**
 * Relation sections have no dynamic-property sort keys today.
 * Deferred gate for Session 1 is search `q` only (plus lack of a SQL cache).
 */
export function shouldUseSqlRelationWindow(
  store: RelationshipReadStore,
  query?: TableRowsQuery,
): boolean {
  if (tableRowsQueryUsesDeferredSearch(query)) return false;
  return getQueryCache(store) !== null;
}

/**
 * Items / database custom views: SQL window when cache present and not deferred
 * (`q`, unresolved dyn sort, or non-expressible sort).
 * Fixed and column-set dyn sorts with expression indexes are allowed on the SQL path.
 */
export function shouldUseSqlDatabaseWindow(
  store: RelationshipReadStore,
  query: TableRowsQuery | undefined,
  sorts: readonly ViewSortSpec[] | undefined,
  columnDefs: readonly DatabaseColumnDef[],
  options?: { ownerId?: string; contentDir?: string },
): boolean {
  if (tableRowsQueryUsesDeferredSearch(query)) return false;
  if (getQueryCache(store) === null) return false;
  if (tableRowsQueryUsesNonExpressibleSort(sorts, columnDefs)) return false;
  const ownerId = options?.ownerId;
  if (ownerId && tableRowsQueryUsesUnresolvedDynSort(store, ownerId, sorts, columnDefs, options?.contentDir)) {
    return false;
  }
  if (!ownerId && tableRowsQueryUsesDynSort(sorts, columnDefs)) {
    return false;
  }
  return true;
}

/**
 * Composed / generated presentations: SQL window when cache present and not deferred (`q`).
 * Compose ignores column sorts (reorder = membership `order`).
 */
export function shouldUseSqlComposedWindow(
  store: RelationshipReadStore,
  query?: TableRowsQuery,
): boolean {
  if (tableRowsQueryUsesDeferredSearch(query)) return false;
  return getQueryCache(store) !== null;
}

/** Map editor view sorts into cache window sorts (identity for relation edge keys). */
export function relationWindowSortsFromQuery(
  query?: TableRowsQuery,
): ViewSortSpec[] | undefined {
  const sorts = query?.sorts;
  if (!sorts?.length) return undefined;
  return sorts.map((sort) => ({
    column: sort.column,
    direction: sort.direction,
  }));
}

export function requireQueryCache(store: RelationshipReadStore): TomeQueryCache {
  const cache = getQueryCache(store);
  if (!cache) {
    throw new Error("SQL table window requires a SQLite query cache");
  }
  return cache;
}
