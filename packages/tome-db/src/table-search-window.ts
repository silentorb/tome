import type { TableRowsQuery, TableRowsWindow } from "tome-graph-interfaces";
import type { TomeSearch, TomeSearchHit } from "tome-interfaces/search";
import type { Relationship } from "tome-graph-interfaces";
import {
  buildTableRowsWindow,
  resolveWindowBounds,
} from "./table-rows-window";

/** Resolve active searcher from a composed / injectable store. */
export function getStoreSearch(
  store: unknown,
  role: "title" | "content" = "content",
): TomeSearch | null {
  if (
    store &&
    typeof store === "object" &&
    typeof (store as { getSearch?: unknown }).getSearch === "function"
  ) {
    return (
      (store as { getSearch: (r?: "title" | "content") => TomeSearch | null }).getSearch(
        role,
      ) ?? null
    );
  }
  return null;
}

/** Alias used by table builders (always content role). */
export function resolveTableSearcher(store: unknown): TomeSearch | null {
  return getStoreSearch(store, "content");
}

export function reorderByHitIds<T>(
  items: readonly T[],
  hitIds: readonly string[],
  getId: (item: T) => string,
): T[] {
  const byId = new Map<string, T>();
  for (const item of items) {
    byId.set(getId(item), item);
  }
  const ordered: T[] = [];
  for (const id of hitIds) {
    const item = byId.get(id);
    if (item) ordered.push(item);
  }
  return ordered;
}

export type TableSearchWindowResult = {
  hits: TomeSearchHit[];
  rowsWindow: TableRowsWindow;
};

/**
 * Run scoped searcher window for table `q`.
 * When searcher is missing, returns an empty window (no legacy JS relevance).
 */
export function runTableSearchWindow(
  search: TomeSearch | null,
  query: TableRowsQuery | undefined,
  allowedNodeIds: ReadonlySet<string>,
): TableSearchWindowResult {
  const q = query?.q?.trim() ?? "";
  const { offset, limit } = resolveWindowBounds(query);

  if (!q) {
    return {
      hits: [],
      rowsWindow: buildTableRowsWindow(offset, limit, 0),
    };
  }

  if (!search) {
    return {
      hits: [],
      rowsWindow: buildTableRowsWindow(offset, limit, 0),
    };
  }

  if (allowedNodeIds.size === 0) {
    return {
      hits: [],
      rowsWindow: buildTableRowsWindow(offset, limit, 0),
    };
  }

  const resultOrPromise = search.searchWindow({
    query: q,
    offset,
    limit,
    allowedNodeIds,
  });
  if (resultOrPromise instanceof Promise) {
    throw new Error("Async TomeSearch.searchWindow is not supported on the sync table path");
  }

  return {
    hits: resultOrPromise.hits,
    rowsWindow: buildTableRowsWindow(offset, limit, resultOrPromise.total),
  };
}

/** Map search hits to membership edges ordered by search rank (member = sourceNodeId). */
export function membershipEdgesForHits(
  edges: readonly Relationship[],
  hits: readonly TomeSearchHit[],
): Relationship[] {
  return reorderByHitIds(edges, hits.map((h) => h.id), (edge) => edge.sourceNodeId);
}

/** Map search hits to relation edges ordered by search rank (related = targetNodeId). */
export function relationEdgesForHits(
  edges: readonly Relationship[],
  hits: readonly TomeSearchHit[],
): Relationship[] {
  return reorderByHitIds(edges, hits.map((h) => h.id), (edge) => edge.targetNodeId);
}
