/** Possibility window for one event after constraint resolution. */
export interface ResolvedEvent {
  id: string;
  earliestStart: number;
  latestStart: number;
  earliestEnd: number;
  latestEnd: number;
}

/**
 * Non-overlapping timeline placement for one event.
 * Exclusive drawn box is `[start, end)` (ASAP schedule from resolve).
 * `latestStart` / `latestEnd` are slack metadata and must not claim lane space.
 */
export interface LaidOutEvent {
  id: string;
  /** ASAP start (exclusive layout box). */
  start: number;
  /** ASAP end (exclusive layout box). */
  end: number;
  /** 0-based concurrency lane. */
  lane: number;
  /** ALAP slack metadata (optional; not layout geometry). */
  latestStart?: number;
  latestEnd?: number;
}

export type ResolutionErrorCode = "cycle" | "unsatisfiable" | "unknown_event";

export interface ResolutionError {
  code: ResolutionErrorCode;
  message: string;
  eventIds?: string[];
}

export type ResolutionResult =
  | { ok: true; events: ResolvedEvent[] }
  | { ok: false; error: ResolutionError };
