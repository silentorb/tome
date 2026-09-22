/**
 * Ensure expression indexes for fixed dyn sorts (lazy single-flight build from DynAggregate IR).
 */

import type { SetMemberExpressionIndexSort, TomeQueryCache } from "tome-service-interfaces";
import type { ViewSortSpec } from "tome-graph-interfaces";
import { evaluateFixedAggregate, fixedAggregateForResolver } from "./aggregate";
import { expressionIndexKeyForFixedDyn } from "./expression-index-key";
import { loadDynamicProperties, type DynamicPropertyRecord } from "./overlay";
import {
  getQueryCache,
  type RelationshipReadStore,
} from "../graph-store/relationship-read";
import { listSetMemberRowConnections } from "../set-membership";

/** In-process single-flight builds keyed by digest. */
const buildsInFlight = new Map<string, Promise<void>>();

export type FixedDynSortIndexPlan = {
  column: string;
  digest: string;
  resolverId: string;
  params: Record<string, unknown>;
  property: DynamicPropertyRecord;
};

/**
 * Resolve fixed dyn sort columns to index plans. Returns null if any dyn sort is
 * a column-set key or an unknown/unindexed fixed resolver (caller keeps legacy path).
 */
export function planFixedDynSortIndexes(
  store: RelationshipReadStore,
  ownerId: string,
  sorts: readonly ViewSortSpec[] | undefined,
  contentDir?: string,
): FixedDynSortIndexPlan[] | null {
  if (!sorts?.length) return [];
  const properties = loadDynamicProperties(store, ownerId, contentDir);
  const byKey = new Map(properties.map((p) => [p.columnKey, p]));
  const plans: FixedDynSortIndexPlan[] = [];

  for (const sort of sorts) {
    const col = sort.column.trim();
    if (!col) continue;
    const property = byKey.get(col);
    if (!property) {
      // Not a fixed dyn column — may still be relation/name/edge (handled elsewhere).
      continue;
    }
    if (!fixedAggregateForResolver(property.resolverId)) {
      return null;
    }
    const key = expressionIndexKeyForFixedDyn(
      property.resolverId,
      property.params ?? {},
      contentDir,
    );
    if (!key) return null;
    plans.push({
      column: col,
      digest: key.digest,
      resolverId: property.resolverId,
      params: property.params ?? {},
      property,
    });
  }
  return plans;
}

/** True when sorts include a dyn column-set key (pattern-expanded), not a fixed property. */
export function sortsIncludeColumnSetDynKey(
  store: RelationshipReadStore,
  ownerId: string,
  sorts: readonly ViewSortSpec[] | undefined,
  dynColumnKeys: ReadonlySet<string>,
  contentDir?: string,
): boolean {
  if (!sorts?.length) return false;
  const fixedKeys = new Set(
    loadDynamicProperties(store, ownerId, contentDir).map((p) => p.columnKey),
  );
  return sorts.some((sort) => {
    const col = sort.column.trim();
    if (!dynColumnKeys.has(col)) return false;
    return !fixedKeys.has(col);
  });
}

export function ensureFixedDynSortIndexes(
  store: RelationshipReadStore,
  ownerId: string,
  plans: readonly FixedDynSortIndexPlan[],
  contentDir?: string,
): SetMemberExpressionIndexSort[] {
  const cache = getQueryCache(store);
  if (!cache || typeof cache.replaceExpressionIndexValues !== "function") {
    throw new Error("Expression indexes require a SQLite query cache");
  }

  const memberIds = listSetMemberRowConnections(store, ownerId, contentDir).map(
    (rel) => rel.sourceNodeId,
  );

  for (const plan of plans) {
    ensureExpressionIndex(cache, store, plan, memberIds, contentDir);
  }

  return plans.map((plan) => ({ column: plan.column, digest: plan.digest }));
}

function ensureExpressionIndex(
  cache: TomeQueryCache,
  store: RelationshipReadStore,
  plan: FixedDynSortIndexPlan,
  memberIds: readonly string[],
  contentDir?: string,
): void {
  const status = cache.getExpressionIndexStatus(plan.digest);
  if (status === "ready") return;

  const existing = buildsInFlight.get(plan.digest);
  if (existing) {
    // Synchronous API: wait via deasync is unavailable — rebuild inline if another
    // request is in flight on the same tick we just join by rebuilding (idempotent).
  }

  const build = () => {
    const values = evaluateFixedAggregate(
      {
        db: store,
        owner: plan.property.owner,
        viewName: "",
        rowNodeIds: [...memberIds],
      },
      plan.resolverId,
      plan.params,
    );
    const rows = [...values.entries()].map(([memberId, sortValue]) => ({
      memberId,
      sortValue,
    }));
    // Members with no map entry still need a row; evaluate covers rowNodeIds.
    const seen = new Set(rows.map((r) => r.memberId));
    for (const id of memberIds) {
      if (!seen.has(id)) rows.push({ memberId: id, sortValue: 0 });
    }
    cache.replaceExpressionIndexValues(
      plan.digest,
      JSON.stringify({
        resolverId: plan.resolverId,
        columnKey: plan.column,
        owner: plan.property.owner,
      }),
      rows,
    );
  };

  buildsInFlight.set(plan.digest, Promise.resolve().then(build));
  try {
    build();
  } finally {
    buildsInFlight.delete(plan.digest);
  }
}
