import type { TableRowsQuery, ViewSortSpec } from "tome-graph-interfaces";
import type { TomeQueryCache } from "tome-service-interfaces";
import {
  getQueryCache,
  type RelationshipReadStore,
} from "./graph-store/relationship-read";

/**
 * True when table `q` (name filter / relevance) is set — deferred exploration hold
 * for next-level Tome search; keeps the full legacy materialize path.
 */
export function tableRowsQueryUsesDeferredSearch(query?: TableRowsQuery): boolean {
  return Boolean(query?.q?.trim());
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
