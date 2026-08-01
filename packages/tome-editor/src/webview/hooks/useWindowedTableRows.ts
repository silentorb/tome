import { useCallback, useEffect, useRef, useState } from "react";
import type { TableRowsQuery, TableRowsWindow } from "tome-graph-interfaces";
import { DEFAULT_TABLE_ROW_LIMIT } from "tome-graph-interfaces";

export interface WindowedPage<T> {
  rows: T[];
  rowsWindow: TableRowsWindow;
}

interface UseWindowedTableRowsArgs<T> {
  /** Identity of the table seed (tab / perspective); changing resets accumulated rows. */
  seedKey: string;
  seed: WindowedPage<T>;
  q: string;
  sorts?: TableRowsQuery["sorts"];
  fetchPage: (query: TableRowsQuery) => Promise<WindowedPage<T>>;
  /** Merge appended pages into accumulated rows (default: concatenate). */
  mergeRows?: (existing: T[], incoming: T[]) => T[];
  debounceMs?: number;
}

function defaultMerge<T>(existing: T[], incoming: T[]): T[] {
  return [...existing, ...incoming];
}

export function useWindowedTableRows<T>({
  seedKey,
  seed,
  q,
  sorts,
  fetchPage,
  mergeRows = defaultMerge,
  debounceMs = 200,
}: UseWindowedTableRowsArgs<T>): {
  rows: T[];
  rowsWindow: TableRowsWindow;
  loadingMore: boolean;
  reloading: boolean;
  sentinelRef: (node: HTMLElement | null) => void;
  reloadFromStart: () => Promise<void>;
} {
  const [rows, setRows] = useState(seed.rows);
  const [rowsWindow, setRowsWindow] = useState(seed.rowsWindow);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reloading, setReloading] = useState(false);
  const sentinelNodeRef = useRef<HTMLElement | null>(null);
  const fetchPageRef = useRef(fetchPage);
  fetchPageRef.current = fetchPage;
  const mergeRowsRef = useRef(mergeRows);
  mergeRowsRef.current = mergeRows;
  const sortsKey = JSON.stringify(sorts ?? []);
  const qTrimmed = q.trim();
  const requestGen = useRef(0);
  const loadingMoreRef = useRef(false);
  const rowsWindowRef = useRef(rowsWindow);
  rowsWindowRef.current = rowsWindow;
  const qRef = useRef(qTrimmed);
  qRef.current = qTrimmed;
  const sortsRef = useRef(sorts);
  sortsRef.current = sorts;

  useEffect(() => {
    setRows(seed.rows);
    setRowsWindow(seed.rowsWindow);
  }, [seedKey, seed.rows, seed.rowsWindow]);

  const load = useCallback(async (offset: number, mode: "replace" | "append") => {
    const gen = ++requestGen.current;
    if (mode === "append") {
      if (loadingMoreRef.current) return;
      loadingMoreRef.current = true;
      setLoadingMore(true);
    } else {
      setReloading(true);
    }
    try {
      const page = await fetchPageRef.current({
        limit: DEFAULT_TABLE_ROW_LIMIT,
        offset,
        q: qRef.current || undefined,
        sorts: sortsRef.current,
      });
      if (gen !== requestGen.current) return;
      setRowsWindow(page.rowsWindow);
      setRows((prev) =>
        mode === "replace" ? page.rows : mergeRowsRef.current(prev, page.rows),
      );
    } finally {
      if (gen === requestGen.current) {
        if (mode === "append") {
          loadingMoreRef.current = false;
          setLoadingMore(false);
        } else {
          setReloading(false);
        }
      }
    }
  }, []);

  const reloadFromStart = useCallback(async () => {
    await load(0, "replace");
  }, [load]);

  const prevQuery = useRef<{ seedKey: string; q: string; sortsKey: string } | null>(null);
  useEffect(() => {
    const current = { seedKey, q: qTrimmed, sortsKey };
    const previous = prevQuery.current;
    prevQuery.current = current;
    const needsImmediateFetch = qTrimmed.length > 0 || (sorts?.length ?? 0) > 0;

    if (!previous) {
      // Seed already matches server defaults when q/sorts are unset.
      if (needsImmediateFetch) void load(0, "replace");
      return;
    }

    if (previous.seedKey !== seedKey) {
      if (needsImmediateFetch) void load(0, "replace");
      return;
    }

    if (previous.q === qTrimmed && previous.sortsKey === sortsKey) return;

    const timer = window.setTimeout(() => {
      void load(0, "replace");
    }, debounceMs);
    return () => window.clearTimeout(timer);
  }, [seedKey, qTrimmed, sortsKey, sorts, debounceMs, load]);

  const loadMore = useCallback(() => {
    const windowMeta = rowsWindowRef.current;
    if (!windowMeta.hasMore || loadingMoreRef.current) return;
    void load(windowMeta.offset + windowMeta.limit, "append");
  }, [load]);

  const sentinelRef = useCallback((node: HTMLElement | null) => {
    sentinelNodeRef.current = node;
  }, []);

  useEffect(() => {
    const node = sentinelNodeRef.current;
    if (!node || !rowsWindow.hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMore();
        }
      },
      { root: null, rootMargin: "200px", threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore, rowsWindow.hasMore, rows.length]);

  return {
    rows,
    rowsWindow,
    loadingMore,
    reloading,
    sentinelRef,
    reloadFromStart,
  };
}
