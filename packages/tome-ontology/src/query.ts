import type { PerspectiveLabelConfig, TraitEntry } from "tome-graph-interfaces";
import {
  ORDERED_PROPERTY_DEFAULT,
  ORDERED_TRAIT,
  SET_TRAIT,
  SYMMETRIC_TRAIT,
  normalizeTraitKey,
} from "./trait-keys";
import {
  hasTraitInEntries,
  mergeTraitMaps,
  traitConfigFromEntries,
  traitMapFromEntries,
} from "./traits";
import type {
  Pattern,
  PatternMatchContext,
  Predicate,
  RelationshipRuntime,
  TraitMapValue,
} from "./types";

function normalizePredicateId(raw: string): string {
  return raw.trim();
}

export function getPredicate(
  runtime: RelationshipRuntime,
  predicateId: string,
): Predicate | undefined {
  return runtime.predicates.get(normalizePredicateId(predicateId));
}

/**
 * Patterns that match the context. Plan 1: predicate id equality.
 * Optional source/target on the pattern must match when present on either side.
 */
export function patternsMatching(
  runtime: RelationshipRuntime,
  ctx: PatternMatchContext,
): Pattern[] {
  const predicateId = normalizePredicateId(ctx.predicateId);
  return runtime.patterns.filter((pattern) => {
    if (pattern.match.predicateId !== predicateId) return false;
    if (
      pattern.match.sourceTypeId !== undefined &&
      ctx.sourceTypeId !== undefined &&
      pattern.match.sourceTypeId !== ctx.sourceTypeId
    ) {
      return false;
    }
    if (
      pattern.match.targetTypeId !== undefined &&
      ctx.targetTypeId !== undefined &&
      pattern.match.targetTypeId !== ctx.targetTypeId
    ) {
      return false;
    }
    return true;
  });
}

export function traitMapFor(
  runtime: RelationshipRuntime,
  ctx: PatternMatchContext,
): Map<string, TraitMapValue> {
  return mergeTraitMaps(
    patternsMatching(runtime, ctx).map((p) => traitMapFromEntries(p.traits)),
  );
}

export function hasTrait(
  runtime: RelationshipRuntime,
  ctx: PatternMatchContext,
  key: string,
): boolean {
  return traitMapFor(runtime, ctx).has(normalizeTraitKey(key));
}

export function traitConfig(
  runtime: RelationshipRuntime,
  ctx: PatternMatchContext,
  key: string,
): Record<string, unknown> | undefined {
  const value = traitMapFor(runtime, ctx).get(normalizeTraitKey(key));
  if (value === undefined || value === true) return undefined;
  return value;
}

/** Predicate ids that have at least one matching pattern carrying the trait. */
export function typesWithTrait(runtime: RelationshipRuntime, key: string): string[] {
  const normalized = normalizeTraitKey(key);
  const ids: string[] = [];
  for (const predicateId of runtime.predicates.keys()) {
    if (hasTrait(runtime, { predicateId }, normalized)) {
      ids.push(predicateId);
    }
  }
  return ids;
}

export function isSetTraitPredicate(
  runtime: RelationshipRuntime,
  predicateId: string,
): boolean {
  return hasTrait(runtime, { predicateId }, SET_TRAIT);
}

export function isOrderedTraitPredicate(
  runtime: RelationshipRuntime,
  predicateId: string,
): boolean {
  return hasTrait(runtime, { predicateId }, ORDERED_TRAIT);
}

export function isSymmetricPredicate(
  runtime: RelationshipRuntime,
  predicateId: string,
): boolean {
  return hasTrait(runtime, { predicateId }, SYMMETRIC_TRAIT);
}

export function orderedPropertyNameFor(
  runtime: RelationshipRuntime,
  predicateId: string,
): string {
  const config = traitConfig(runtime, { predicateId }, ORDERED_TRAIT);
  const property = config?.property;
  if (typeof property === "string" && property.trim()) {
    return normalizeTraitKey(property);
  }
  return ORDERED_PROPERTY_DEFAULT;
}

const DEFAULT_PARENT_INDEX = 0;
const DEFAULT_CHILD_INDEX = 1;

export interface SetRoleIndices {
  parentIndex: 0 | 1;
  childIndex: 0 | 1;
}

function parseIndex(value: unknown, fallback: 0 | 1): 0 | 1 {
  if (value === 0 || value === 1) return value;
  return fallback;
}

export function setRoleIndicesFor(
  runtime: RelationshipRuntime,
  predicateId: string,
): SetRoleIndices {
  const config = traitConfig(runtime, { predicateId }, SET_TRAIT);
  const parentIndex = parseIndex(config?.parentIndex, DEFAULT_PARENT_INDEX);
  const childIndex = parseIndex(config?.childIndex, DEFAULT_CHILD_INDEX);
  if (parentIndex === childIndex) {
    return { parentIndex: DEFAULT_PARENT_INDEX, childIndex: DEFAULT_CHILD_INDEX };
  }
  return { parentIndex, childIndex };
}

/** Merged traits from matching patterns (for tests / adapters). */
export function traitsFor(
  runtime: RelationshipRuntime,
  ctx: PatternMatchContext,
): TraitEntry[] {
  const map = traitMapFor(runtime, ctx);
  const out: TraitEntry[] = [];
  for (const [key, value] of map) {
    if (value === true) {
      out.push(key);
    } else {
      out.push({ key, ...value });
    }
  }
  return out;
}

function perspectiveLinkExisting(config: PerspectiveLabelConfig): boolean | undefined {
  return typeof config === "string" ? undefined : config.linkExisting;
}

/**
 * Whether a relation section should offer link-existing.
 * Defaults to true when unset (matches legacy associations behavior).
 */
export function linkExistingFor(
  runtime: RelationshipRuntime,
  ctx: PatternMatchContext,
): boolean {
  const predicate = getPredicate(runtime, ctx.predicateId);
  if (!predicate) return false;
  const patterns = patternsMatching(runtime, ctx);
  if (patterns.length === 0) return false;

  const endpointIndex = ctx.endpointIndex ?? 0;
  const perspective = predicate.perspectives[endpointIndex];
  const fromLabel = perspective !== undefined ? perspectiveLinkExisting(perspective) : undefined;
  if (fromLabel !== undefined) return fromLabel;

  for (const pattern of patterns) {
    if (pattern.linkExisting !== undefined) return pattern.linkExisting;
  }
  return true;
}

/** Def-shaped trait helpers for AC adapters that still hold a traits array. */
export {
  hasTraitInEntries,
  traitConfigFromEntries,
  traitMapFromEntries,
};
