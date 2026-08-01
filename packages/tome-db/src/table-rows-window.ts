import type { TableRowsQuery, TableRowsWindow } from "tome-graph-interfaces";
import { sortBySearchRelevance } from "./search-relevance";

export type { TableRowsQuery, TableRowsWindow } from "tome-graph-interfaces";
export { DEFAULT_TABLE_ROW_LIMIT } from "tome-graph-interfaces";

export function matchesTableNameFilter(name: string, query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return true;
  return name.toLocaleLowerCase().includes(trimmed.toLocaleLowerCase());
}

export function filterRowsByName<T>(
  rows: readonly T[],
  query: string,
  getName: (row: T) => string,
): T[] {
  const trimmed = query.trim();
  if (!trimmed) return [...rows];
  const filtered = rows.filter((row) => matchesTableNameFilter(getName(row), trimmed));
  return sortBySearchRelevance(filtered, trimmed, getName);
}

/** Normalize offset/limit; `limit: null` means return the full set. */
export function resolveWindowBounds(query?: TableRowsQuery): {
  offset: number;
  limit: number | null;
} {
  const offsetRaw = query?.offset;
  const offset =
    typeof offsetRaw === "number" && Number.isFinite(offsetRaw) && offsetRaw > 0
      ? Math.floor(offsetRaw)
      : 0;
  const limitRaw = query?.limit;
  if (limitRaw === undefined || limitRaw === null) {
    return { offset: 0, limit: null };
  }
  const limit =
    typeof limitRaw === "number" && Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.floor(limitRaw)
      : null;
  return { offset, limit };
}

export function buildTableRowsWindow(
  offset: number,
  limit: number | null,
  total: number,
): TableRowsWindow {
  if (limit === null) {
    return { offset: 0, limit: total, total, hasMore: false };
  }
  const safeOffset = Math.min(offset, total);
  return {
    offset: safeOffset,
    limit,
    total,
    hasMore: safeOffset + limit < total,
  };
}

/**
 * Apply name filter (with relevance re-sort when `q` is set), then slice.
 * Caller should already have applied view/user sorts when `q` is empty.
 */
export function applyNameFilterAndWindow<T>(
  rows: readonly T[],
  query: TableRowsQuery | undefined,
  getName: (row: T) => string,
): { rows: T[]; rowsWindow: TableRowsWindow } {
  const q = query?.q?.trim() ?? "";
  const filtered = q ? filterRowsByName(rows, q, getName) : [...rows];
  const { offset, limit } = resolveWindowBounds(query);
  const rowsWindow = buildTableRowsWindow(offset, limit, filtered.length);
  if (limit === null) {
    return { rows: filtered, rowsWindow };
  }
  return {
    rows: filtered.slice(rowsWindow.offset, rowsWindow.offset + limit),
    rowsWindow,
  };
}
