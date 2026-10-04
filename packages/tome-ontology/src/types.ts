import type {
  ImpGraph,
  PerspectivePair,
  TraitEntry,
} from "tome-graph-interfaces";

/** Edge-kind identity + display metadata. Traits do not live on predicates. */
export interface Predicate {
  /** Stable id (today: associations.json ULID key, or ontology predicate node id). */
  id: string;
  perspectives: PerspectivePair;
  /**
   * Optional Imp node→boolean filter from a structured body property
   * (`{#predicate type="node-filter"}`).
   */
  nodeFilter?: ImpGraph;
}

/**
 * What a pattern matches. Plan 1 uses predicate id only; source/target type
 * fields are reserved for richer specificity later.
 */
export interface PatternMatch {
  predicateId: string;
  sourceTypeId?: string;
  targetTypeId?: string;
}

/** Endpoint type constraints attached to a pattern (from AC `endpoints`). */
export interface PatternEndpointConstraints {
  0: { typeId: string };
  1: { typeId: string };
}

/**
 * A match scope with attached traits / link policy / endpoint constraints.
 * Traits apply to things that match the pattern, not to the predicate itself.
 */
export interface Pattern {
  id: string;
  match: PatternMatch;
  traits: TraitEntry[];
  linkExisting?: boolean;
  endpoints?: PatternEndpointConstraints;
}

export interface RelationshipRuntime {
  predicates: Map<string, Predicate>;
  patterns: Pattern[];
}

/** Context used to select matching patterns (Plan 1: predicate id). */
export interface PatternMatchContext {
  predicateId: string;
  sourceTypeId?: string;
  targetTypeId?: string;
  /** Optional; used when resolving per-endpoint linkExisting on perspectives. */
  endpointIndex?: 0 | 1;
}

export type TraitMapValue = true | Record<string, unknown>;
