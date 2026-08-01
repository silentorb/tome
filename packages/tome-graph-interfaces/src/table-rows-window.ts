import type { ViewSortSpec } from "./views";

/** Metadata for a sliced table-row response (infinite scroll / lazy load). */
export interface TableRowsWindow {
  offset: number;
  limit: number;
  /** Row count after name filter (before slice). */
  total: number;
  hasMore: boolean;
}

/** Options for windowed multi-row table fetches. */
export interface TableRowsQuery {
  /** When omitted, return the full filtered/sorted set. */
  limit?: number;
  offset?: number;
  /** Case-insensitive substring filter on row name/title. */
  q?: string;
  /** When set, overrides the active view's sorts for this request. */
  sorts?: ViewSortSpec[];
}

/** Default batch size for editor HTTP table-row windows. */
export const DEFAULT_TABLE_ROW_LIMIT = 50;
