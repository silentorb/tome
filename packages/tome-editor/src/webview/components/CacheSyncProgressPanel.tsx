import type { ApiHealth } from "../../shared/http-client";

export type CacheSyncProgressView = {
  phase?: string;
  progress?: number;
  current?: number;
  total?: number;
  message?: string;
};

export function cacheSyncProgressFromHealth(health: ApiHealth): CacheSyncProgressView {
  return {
    phase: health.phase,
    progress: health.progress,
    current: health.current,
    total: health.total,
    message: health.message,
  };
}

function phaseLabel(phase?: string): string {
  switch (phase) {
    case "check":
      return "Checking cache…";
    case "rebuild":
      return "Preparing rebuild…";
    case "rebuild_nodes":
      return "Rebuilding nodes…";
    case "expand_relationships":
      return "Expanding relationships…";
    case "reconcile":
      return "Reconciling node bodies…";
    case "ready":
      return "Cache ready";
    default:
      return "Syncing cache…";
  }
}

export function CacheSyncProgressPanel({ status }: { status: CacheSyncProgressView }) {
  const hasProgress = status.progress != null && Number.isFinite(status.progress);
  const percent = hasProgress ? Math.round((status.progress as number) * 100) : null;
  const detail =
    status.message?.trim() ||
    (status.current != null && status.total != null
      ? `${status.current.toLocaleString()} / ${status.total.toLocaleString()}`
      : null);

  return (
    <div className="tome-syncing" role="status" aria-live="polite">
      <h2 className="tome-syncing-title">{phaseLabel(status.phase)}</h2>
      <p className="tome-syncing-copy">
        Graph data is temporarily unavailable while the SQLite cache syncs.
      </p>
      <div
        className={`tome-syncing-bar${hasProgress ? "" : " is-indeterminate"}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
        role="progressbar"
      >
        <div
          className="tome-syncing-bar-fill"
          style={hasProgress ? { width: `${percent}%` } : undefined}
        />
      </div>
      <div className="tome-syncing-meta">
        {percent != null ? <span>{percent}%</span> : <span>In progress…</span>}
        {detail ? <span className="tome-syncing-detail">{detail}</span> : null}
      </div>
    </div>
  );
}
