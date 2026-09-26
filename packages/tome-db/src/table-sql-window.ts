import type {
  DatabaseColumnDef,
  TableRowsQuery,
  ViewSortSpec,
} from "tome-graph-interfaces";
import type { TomeQueryCache, ProfilingAttributes } from "tome-service-interfaces";
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
import { resolveWindowBounds } from "./table-rows-window";

/**
 * True when table `q` is set — an optional search operator, not a window backend.
 * Prefer {@link explodeTableWindowRequest} at table-window call sites.
 */
export function tableRowsQueryUsesTableSearch(query?: TableRowsQuery): boolean {
  return Boolean(query?.q?.trim());
}

/** @deprecated Use {@link tableRowsQueryUsesTableSearch}. */
export function tableRowsQueryUsesDeferredSearch(query?: TableRowsQuery): boolean {
  return tableRowsQueryUsesTableSearch(query);
}

/** How limit/offset/sorts run after optional search: SQL cache vs in-memory JS. */
export type TableWindowBackend = "sql" | "js";

/**
 * Exploded table-window request: backend capability + optional search operator.
 * Search is not a window mode — when `searchQuery` is set, run a prior searcher
 * query, then the uniform window step (hydrate by hit ids on the SQL path).
 */
export type TableWindowRequestPlan = {
  backend: TableWindowBackend;
  /** Trimmed table `q`, or absent when no search operator. */
  searchQuery?: string;
  sorts: ViewSortSpec[];
  offset: number;
  limit: number | null;
  /** Stable reasons for tests and profiling attrs (e.g. `query_cache`, `table_q`). */
  reasons: string[];
};

/** Flat profiling attributes from an exploded table-window plan. */
export function tableWindowProfilingAttrs(plan: TableWindowRequestPlan): ProfilingAttributes {
  return {
    "table.backend": plan.backend,
    "table.has_search": Boolean(plan.searchQuery),
    "table.reasons": plan.reasons.join(","),
  };
}

/**
 * Explode a table rows query into backend + operators once.
 * Surfaces then run: optional searcher query → uniform window → hydrate.
 */
export function explodeTableWindowRequest(
  store: RelationshipReadStore,
  query?: TableRowsQuery,
): TableWindowRequestPlan {
  const reasons: string[] = [];
  const cachePresent = getQueryCache(store) !== null;
  const backend: TableWindowBackend = cachePresent ? "sql" : "js";
  reasons.push(cachePresent ? "query_cache" : "no_query_cache");

  const trimmedQ = query?.q?.trim() ?? "";
  const searchQuery = trimmedQ.length > 0 ? trimmedQ : undefined;
  if (searchQuery) reasons.push("table_q");

  const { offset, limit } = resolveWindowBounds(query);

  return {
    backend,
    searchQuery,
    sorts: query?.sorts ? [...query.sorts] : [],
    offset,
    limit,
    reasons,
  };
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
