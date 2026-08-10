/** Possibility window for one event after resolution. */
export interface ResolvedEvent {
  id: string;
  earliestStart: number;
  latestStart: number;
  earliestEnd: number;
  latestEnd: number;
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
