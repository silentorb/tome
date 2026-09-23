import type {
  DatabaseColumnDef,
  TableRowsQuery,
  ViewSortSpec,
} from "tome-graph-interfaces";
import type { TomeQueryCache } from "tome-service-interfaces";
import { isSafeSqlPropertyKey } from "tome-sqlite";
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
 * True when table `q` is set — routes to scoped TomeSearch windows on the SQL path
 * (or empty results when no searcher). Flatfile keeps the legacy name-filter path.
 */
export function tableRowsQueryUsesTableSearch(query?: TableRowsQuery): boolean {
  return Boolean(query?.q?.trim());
}

/** @deprecated Use {@link tableRowsQueryUsesTableSearch}. */
export function tableRowsQueryUsesDeferredSearch(query?: TableRowsQuery): boolean {
  return tableRowsQueryUsesTableSearch(query);
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

/**
 * Sorts that cannot be expressed in the Items SQL window (unknown / unsafe keys).
 * Dyn sorts are checked separately via {@link tableRowsQueryUsesUnresolvedDynSort}.
 * On SQLite, callers should {@link resolveSqlWindowSorts} instead of full-materializing.
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

export type ResolvedSqlWindowSorts = {
  sorts: ViewSortSpec[];
  refusedReasons: string[];
};

function isDynSortColumn(
  col: string,
  dynKeys: ReadonlySet<string>,
  store: RelationshipReadStore | undefined,
  ownerId: string | undefined,
  contentDir: string | undefined,
): boolean {
  if (dynKeys.has(col)) return true;
  if (!store || !ownerId) return false;
  const columnSets = loadDynamicColumnSets(store, ownerId, contentDir);
  return columnSets.some(
    (set) => parseDimensionIdFromColumnKey(set.columnKeyPattern, col) != null,
  );
}

/**
 * Drop non-expressible / unresolved dyn sorts so the SQL window can still run.
 * Refused sorts fall back to default membership order; flatfile is not this path.
 */
export function resolveSqlWindowSorts(
  store: RelationshipReadStore,
  ownerId: string | undefined,
  sorts: readonly ViewSortSpec[] | undefined,
  columnDefs: readonly DatabaseColumnDef[],
  contentDir?: string,
): ResolvedSqlWindowSorts {
  if (!sorts?.length) {
    return { sorts: [], refusedReasons: [] };
  }
  const byKey = new Map(columnDefs.map((def) => [def.key, def]));
  const dynKeys = new Set(
    columnDefs.filter((def) => def.source === "dynamic").map((def) => def.key),
  );
  const kept: ViewSortSpec[] = [];
  const refusedReasons: string[] = [];

  for (const sort of sorts) {
    const col = sort.column.trim();
    if (!col) continue;
    if (col === "name") {
      kept.push(sort);
      continue;
    }
    if (!isSafeSqlPropertyKey(col)) {
      refusedReasons.push(`${col}: unsafe SQL property key`);
      continue;
    }
    const def = byKey.get(col);
    if (def?.type === "relation" && !def.relationType?.trim()) {
      refusedReasons.push(`${col}: relation column missing relationType`);
      continue;
    }
    const dyn = isDynSortColumn(col, dynKeys, store, ownerId, contentDir);
    if (dyn) {
      if (!ownerId) {
        refusedReasons.push(`${col}: dyn sort requires ownerId`);
        continue;
      }
      const plans = planDynSortIndexes(store, ownerId, [sort], dynKeys, contentDir);
      if (plans === null) {
        refusedReasons.push(`${col}: unresolved dyn sort (no expression index plan)`);
        continue;
      }
      kept.push(sort);
      continue;
    }
    kept.push(sort);
  }

  if (refusedReasons.length > 0) {
    for (const reason of refusedReasons) {
      console.warn(`[tome-db] refused SQL window sort: ${reason}`);
    }
  }

  return { sorts: kept, refusedReasons };
}

/**
 * Relation sections: SQL window when cache present.
 * Table `q` uses scoped searcher windows (still SQL path); see {@link shouldUseSqlRelationSearchWindow}.
 * Unknown sort keys are ignored in bind (fail-closed at ORDER BY), not a full-materialize escape.
 */
export function shouldUseSqlRelationWindow(
  store: RelationshipReadStore,
  query?: TableRowsQuery,
): boolean {
  if (tableRowsQueryUsesTableSearch(query)) {
    // Search path handled separately; do not use sort/limit SQL window.
    return false;
  }
  return getQueryCache(store) !== null;
}

/** Relation `q`: cache present (searcher may be null → empty window). */
export function shouldUseSqlRelationSearchWindow(
  store: RelationshipReadStore,
  query?: TableRowsQuery,
): boolean {
  return tableRowsQueryUsesTableSearch(query) && getQueryCache(store) !== null;
}

/**
 * Items / database custom views: SQL window when cache present.
 * Non-expressible / unresolved dyn sorts are refused via {@link resolveSqlWindowSorts}
 * (default membership order) — they do not fall back to full materialize.
 * Table `q` uses the searcher path ({@link shouldUseSqlDatabaseSearchWindow}).
 */
export function shouldUseSqlDatabaseWindow(
  store: RelationshipReadStore,
  query: TableRowsQuery | undefined,
  _sorts?: readonly ViewSortSpec[] | undefined,
  _columnDefs?: readonly DatabaseColumnDef[],
  _options?: { ownerId?: string; contentDir?: string },
): boolean {
  if (tableRowsQueryUsesTableSearch(query)) return false;
  return getQueryCache(store) !== null;
}

/** Items `q`: cache present (searcher may be null → empty window). */
export function shouldUseSqlDatabaseSearchWindow(
  store: RelationshipReadStore,
  query?: TableRowsQuery,
): boolean {
  return tableRowsQueryUsesTableSearch(query) && getQueryCache(store) !== null;
}

/**
 * Composed / generated presentations: SQL window when cache present and not searching.
 * Sort expressibility uses {@link resolveSqlWindowSorts} on the SQL path (fail-closed).
 */
export function shouldUseSqlComposedWindow(
  store: RelationshipReadStore,
  query?: TableRowsQuery,
  _columnDefs?: readonly DatabaseColumnDef[],
  _options?: { ownerId?: string; contentDir?: string },
): boolean {
  if (tableRowsQueryUsesTableSearch(query)) return false;
  return getQueryCache(store) !== null;
}

/** Composed `q`: cache present (searcher may be null → empty window). */
export function shouldUseSqlComposedSearchWindow(
  store: RelationshipReadStore,
  query?: TableRowsQuery,
): boolean {
  return tableRowsQueryUsesTableSearch(query) && getQueryCache(store) !== null;
}

/** Whether the store has an injectable searcher (may still be null). */
export function storeSupportsSearchInjection(store: RelationshipReadStore): boolean {
  return typeof (store as { getSearch?: unknown }).getSearch === "function";
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
