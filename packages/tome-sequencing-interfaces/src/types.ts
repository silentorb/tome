/** Fixed length or stretch-to-fit between constraints. */
export type DurationSpec = number | "flex";

/** One event in a sequencing problem (domain-agnostic id). */
export interface SequenceEvent {
  id: string;
  duration?: DurationSpec;
  /** Many-to-many parents; child range must lie within each parent. */
  parentIds?: string[];
}

/** Directed finish-to-start: prerequisite must finish before dependent starts (unless parallel-eligible). */
export interface DependsConstraint {
  prerequisiteId: string;
  dependentId: string;
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
