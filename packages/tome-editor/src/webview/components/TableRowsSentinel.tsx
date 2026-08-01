interface TableRowsSentinelProps {
  sentinelRef: (node: HTMLElement | null) => void;
  hasMore: boolean;
  loadingMore: boolean;
  total: number;
  loaded: number;
}

export function TableRowsSentinel({
  sentinelRef,
  hasMore,
  loadingMore,
  total,
  loaded,
}: TableRowsSentinelProps) {
  if (total === 0) return null;
  return (
    <div
      ref={sentinelRef}
      className="tome-table-rows-sentinel"
      aria-live="polite"
    >
      {loadingMore ? (
        <span className="tome-table-rows-sentinel-status">Loading…</span>
      ) : hasMore ? (
        <span className="tome-table-rows-sentinel-status">
          Showing {loaded} of {total}
        </span>
      ) : loaded < total ? (
        <span className="tome-table-rows-sentinel-status">
          Showing {loaded} of {total}
        </span>
      ) : null}
    </div>
  );
}
