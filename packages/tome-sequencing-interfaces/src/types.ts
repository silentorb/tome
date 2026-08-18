/** Fixed length or stretch-to-fit between constraints. */
export type DurationSpec = number | "flex";

/** One end of an event interval (not an FS/SS/FF/SF enum). */
export type SequenceEndpoint = "start" | "end";

/** One event in a sequencing problem (domain-agnostic id). */
export interface SequenceEvent {
  id: string;
  duration?: DurationSpec;
  /** Many-to-many parents; child range must lie within each parent. */
  parentIds?: string[];
}

/**
 * Directed depends edge attached to endpoints, not whole events.
 * `from` is the prerequisite endpoint; `to` is the dependent endpoint.
 * Display as `${from} → ${to}` (e.g. end → start).
 */
export interface DependsConstraint {
  prerequisiteId: string;
  dependentId: string;
  from: SequenceEndpoint;
  to: SequenceEndpoint;
}

/** When true, the pair may overlap in time despite no depends edge. */
export type CanRunParallel = (aId: string, bId: string) => boolean;

/** Domain-agnostic input to chronological resolution. */
export interface SequencingProblem {
  events: SequenceEvent[];
  depends: DependsConstraint[];
  defaultDuration: number;
  canRunParallel?: CanRunParallel;
}
