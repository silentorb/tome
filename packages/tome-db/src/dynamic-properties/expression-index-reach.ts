/**
 * Resolve DynAggregate IR + overlay params to concrete relationship types
 * used for narrow expression-index invalidation.
 */

import {
  loadAssociationsFromContent,
  projectionTypesForComposite,
  resolveContentPath,
  setTraitProjectionTypes,
} from "tome-flatfile";
import type { DynAggregateSpec, ReachSpec } from "./aggregate";

function stringParam(params: Record<string, unknown>, key: string): string {
  return String(params[key] ?? "").trim();
}

function addReachSpecTypes(
  out: Set<string>,
  reach: ReachSpec,
  params: Record<string, unknown>,
): void {
  const raw = stringParam(params, reach.paramKey);
  if (!raw) return;
  out.add(raw);
  if (reach.kind === "composite") {
    for (const projection of projectionTypesForComposite(raw)) {
      out.add(projection);
    }
  }
}

/**
 * Concrete projection / composite type strings whose mutations should stale
 * an expression index built from this aggregate + params.
 *
 * Always includes owner set-trait projection types (membership add/remove).
 * For `sumEnumWeightAlong`, also includes set-trait types for the membership
 * set named by `membershipSetIdParam` (priority on those edges).
 */
export function collectExpressionIndexReachTypes(
  spec: DynAggregateSpec,
  params: Record<string, unknown>,
  _ownerId: string,
  contentDir?: string,
): string[] {
  const dir = contentDir ?? resolveContentPath();
  const registry = loadAssociationsFromContent(dir);
  const out = new Set<string>(setTraitProjectionTypes(registry));

  switch (spec.kind) {
    case "countReach":
      addReachSpecTypes(out, spec.primary, params);
      if (spec.fallback) addReachSpecTypes(out, spec.fallback, params);
      break;
    case "countReachWhere":
      addReachSpecTypes(out, spec.reachPrimary, params);
      if (spec.reachFallback) addReachSpecTypes(out, spec.reachFallback, params);
      {
        const whereType = stringParam(params, spec.whereProjectionParam);
        if (whereType) out.add(whereType);
      }
      break;
    case "countReachWhereRelated":
      addReachSpecTypes(out, spec.reachPrimary, params);
      if (spec.reachFallback) addReachSpecTypes(out, spec.reachFallback, params);
      addReachSpecTypes(out, spec.relatedPrimary, params);
      if (spec.relatedFallback) addReachSpecTypes(out, spec.relatedFallback, params);
      break;
    case "sumEnumWeightAlong":
      addReachSpecTypes(out, spec.reachPrimary, params);
      if (spec.reachFallback) addReachSpecTypes(out, spec.reachFallback, params);
      // Enum weight lives on membership edges of membershipSetIdParam's set;
      // all set-trait projections already cover those types via `out` above.
      break;
  }

  return [...out].sort((a, b) => a.localeCompare(b));
}
