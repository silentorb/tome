/**
 * Ensure expression indexes for fixed and column-set dyn sorts
 * (lazy single-flight build from DynAggregate IR).
 */

import type { SetMemberExpressionIndexSort, TomeQueryCache } from "tome-service-interfaces";
import type { ViewSortSpec } from "tome-graph-interfaces";
import {
  columnSetAggregateForResolver,
  evaluateColumnSetAggregate,
  evaluateFixedAggregate,
  fixedAggregateForResolver,
} from "./aggregate";
import {
  expressionIndexKeyForColumnSetDyn,
  expressionIndexKeyForFixedDyn,
} from "./expression-index-key";
import {
  loadDynamicColumnSets,
  loadDynamicProperties,
  type DynamicColumnSetRecord,
  type DynamicPropertyRecord,
} from "./overlay";
import { parseDimensionIdFromColumnKey } from "./registry";
import {
  getQueryCache,
  type RelationshipReadStore,
} from "../graph-store/relationship-read";
import { listSetMemberRowConnections } from "../set-membership";

/** In-process single-flight builds keyed by digest. */
const buildsInFlight = new Map<string, Promise<void>>();

export type DynSortIndexPlan = {
  column: string;
  digest: string;
  resolverId: string;
  params: Record<string, unknown>;
  owner: string;
  dimensionId?: string;
  property?: DynamicPropertyRecord;
  columnSet?: DynamicColumnSetRecord;
};

/** @deprecated Prefer DynSortIndexPlan — fixed-only plans share the same shape. */
export type FixedDynSortIndexPlan = DynSortIndexPlan;

/**
 * Resolve dyn sort columns (fixed + column-set) to index plans.
 * Returns null if any dyn sort cannot be indexed (caller keeps legacy path).
 * Non-dyn sort columns are ignored here (handled by SQL window sorts elsewhere).
 *
 * Column-set keys are matched by pattern even when not yet present in
 * {@link dynColumnKeys} (gate discovery may run with empty row ids).
 */
export function planDynSortIndexes(
  store: RelationshipReadStore,
  ownerId: string,
  sorts: readonly ViewSortSpec[] | undefined,
  dynColumnKeys: ReadonlySet<string>,
  contentDir?: string,
): DynSortIndexPlan[] | null {
  if (!sorts?.length) return [];
  const properties = loadDynamicProperties(store, ownerId, contentDir);
  const byFixedKey = new Map(properties.map((p) => [p.columnKey, p]));
  const columnSets = loadDynamicColumnSets(store, ownerId, contentDir);
  const plans: DynSortIndexPlan[] = [];

  for (const sort of sorts) {
    const col = sort.column.trim();
    if (!col) continue;

    const property = byFixedKey.get(col);
    if (property) {
      if (!fixedAggregateForResolver(property.resolverId)) return null;
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
        owner: property.owner,
        property,
      });
      continue;
    }

    const matched = matchColumnSetSort(columnSets, col);
    if (matched) {
      const { columnSet, dimensionId } = matched;
      if (!columnSetAggregateForResolver(columnSet.resolverId)) return null;
      const key = expressionIndexKeyForColumnSetDyn(
        columnSet.resolverId,
        columnSet.params ?? {},
        dimensionId,
        contentDir,
      );
      if (!key) return null;
      plans.push({
        column: col,
        digest: key.digest,
        resolverId: columnSet.resolverId,
        params: columnSet.params ?? {},
        owner: columnSet.owner,
        dimensionId,
        columnSet,
      });
      continue;
    }

    if (dynColumnKeys.has(col)) {
      // Dyn column (from defs) with no fixed/column-set plan → unresolved.
      return null;
    }
  }
  return plans;
}

function matchColumnSetSort(
  columnSets: readonly DynamicColumnSetRecord[],
  columnKey: string,
): { columnSet: DynamicColumnSetRecord; dimensionId: string } | null {
  for (const columnSet of columnSets) {
    const dimensionId = parseDimensionIdFromColumnKey(columnSet.columnKeyPattern, columnKey);
    if (dimensionId) return { columnSet, dimensionId };
  }
  return null;
}

/**
 * Resolve fixed dyn sort columns to index plans.
 * Prefer {@link planDynSortIndexes} when column-set keys may appear.
 */
export function planFixedDynSortIndexes(
  store: RelationshipReadStore,
  ownerId: string,
  sorts: readonly ViewSortSpec[] | undefined,
  contentDir?: string,
): DynSortIndexPlan[] | null {
  if (!sorts?.length) return [];
  const properties = loadDynamicProperties(store, ownerId, contentDir);
  const fixedKeys = new Set(properties.map((p) => p.columnKey));
  return planDynSortIndexes(store, ownerId, sorts, fixedKeys, contentDir);
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

export function ensureDynSortIndexes(
  store: RelationshipReadStore,
  ownerId: string,
  plans: readonly DynSortIndexPlan[],
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

/** @deprecated Prefer ensureDynSortIndexes */
export function ensureFixedDynSortIndexes(
  store: RelationshipReadStore,
  ownerId: string,
  plans: readonly DynSortIndexPlan[],
  contentDir?: string,
): SetMemberExpressionIndexSort[] {
  return ensureDynSortIndexes(store, ownerId, plans, contentDir);
}

function ensureExpressionIndex(
  cache: TomeQueryCache,
  store: RelationshipReadStore,
  plan: DynSortIndexPlan,
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
    const ctx = {
      db: store,
      owner: plan.owner,
      viewName: "",
      rowNodeIds: [...memberIds],
    };
    const values =
      plan.dimensionId != null
        ? evaluateColumnSetAggregate(ctx, plan.resolverId, plan.params, plan.dimensionId)
        : evaluateFixedAggregate(ctx, plan.resolverId, plan.params);
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
        owner: plan.owner,
        dimensionId: plan.dimensionId ?? null,
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
