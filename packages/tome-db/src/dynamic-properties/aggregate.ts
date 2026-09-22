/**
 * DynAggregate IR — single semantic description for fixed dyn rollups.
 * Used to build expression-index values and (as fallback) to evaluate sort keys.
 */

import type { DynamicResolverContext } from "./registry";
import {
  buildAllSceneCountPrefetch,
  buildWeightedUsePrefetch,
  buildWonderPrefetch,
  resolveAllSceneCount,
  resolveWeightedUse,
  resolveWonder,
} from "./resolvers/index";

export type ReachSpec =
  | { kind: "composite"; paramKey: string }
  | { kind: "projection"; paramKey: string };

export type DynAggregateSpec =
  | {
      kind: "countReach";
      primary: ReachSpec;
      fallback?: ReachSpec;
    }
  | {
      kind: "countReachWhere";
      reachPrimary: ReachSpec;
      reachFallback?: ReachSpec;
      whereProjectionParam: string;
      whereTargetParam: string;
    }
  | {
      kind: "sumEnumWeightAlong";
      reachPrimary: ReachSpec;
      reachFallback?: ReachSpec;
      membershipSetIdParam: string;
      enumId: string;
      propertyKey: string;
    };

/** Machine authority for each fixed resolverId. */
export const FIXED_AGGREGATE_BY_RESOLVER: Readonly<Record<string, DynAggregateSpec>> = {
  "characters.allSceneCount": {
    kind: "countReach",
    primary: { kind: "composite", paramKey: "characters_scene_composite" },
    fallback: { kind: "projection", paramKey: "scenes_edge_label" },
  },
  "inspirations.wonder": {
    kind: "countReachWhere",
    reachPrimary: { kind: "composite", paramKey: "inspiration_feature_composite" },
    reachFallback: { kind: "projection", paramKey: "features_edge_label" },
    whereProjectionParam: "theme_edge_label",
    whereTargetParam: "theme_target_id",
  },
  "inspirations.weightedUse": {
    kind: "sumEnumWeightAlong",
    reachPrimary: { kind: "composite", paramKey: "inspiration_feature_composite" },
    reachFallback: { kind: "projection", paramKey: "features_edge_label" },
    membershipSetIdParam: "features_table_id",
    enumId: "priority",
    propertyKey: "priority",
  },
};

export function fixedAggregateForResolver(resolverId: string): DynAggregateSpec | null {
  return FIXED_AGGREGATE_BY_RESOLVER[resolverId] ?? null;
}

/**
 * Canonical JSON payload for hashing (stable key order).
 * Params are the bound overlay params; only keys referenced by the spec matter for equality,
 * but we include the full param bag sorted so binding drift busts the digest.
 */
export function canonicalizeDynAggregate(
  resolverId: string,
  spec: DynAggregateSpec,
  params: Record<string, unknown>,
): unknown {
  return {
    format: "dyn-aggregate-v1",
    resolverId,
    spec,
    params: sortKeysDeep(params),
  };
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort((a, b) => a.localeCompare(b))) {
      out[key] = sortKeysDeep(obj[key]);
    }
    return out;
  }
  return value;
}

/**
 * Evaluate the aggregate for every member id (definition / index-build path).
 * Delegates to existing resolvers so display and index stay one algorithm until
 * resolvers are fully inlined into the IR interpreters.
 */
export function evaluateFixedAggregate(
  ctx: DynamicResolverContext,
  resolverId: string,
  params: Record<string, unknown>,
): Map<string, number> {
  const out = new Map<string, number>();
  switch (resolverId) {
    case "characters.allSceneCount": {
      const prefetch = buildAllSceneCountPrefetch(ctx, params);
      for (const nodeId of ctx.rowNodeIds) {
        out.set(nodeId, Number(resolveAllSceneCount(ctx, params, nodeId, prefetch)) || 0);
      }
      return out;
    }
    case "inspirations.wonder": {
      const prefetch = buildWonderPrefetch(ctx, params);
      for (const nodeId of ctx.rowNodeIds) {
        out.set(nodeId, Number(resolveWonder(ctx, params, nodeId, prefetch)) || 0);
      }
      return out;
    }
    case "inspirations.weightedUse": {
      const prefetch = buildWeightedUsePrefetch(ctx, params);
      for (const nodeId of ctx.rowNodeIds) {
        out.set(nodeId, Number(resolveWeightedUse(ctx, params, nodeId, prefetch)) || 0);
      }
      return out;
    }
    default:
      return out;
  }
}
