/**
 * Ensure expression indexes for fixed and column-set dyn sorts
 * (lazy single-flight build from DynAggregate IR).
 */

import {
  withProfilingSpan,
  type MemberPageExpressionIndexSort,
  type TomeQueryCache,
} from "tome-service-interfaces";
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
import { collectExpressionIndexReachTypes } from "./expression-index-reach";
import {
  loadDynamicColumnSets,
  loadDynamicProperties,
  type DynamicColumnSetRecord,
  type DynamicPropertyRecord,
} from "./overlay";
import { parseDimensionIdFromColumnKey } from "./registry";
import {
  getQueryCache,
  isGraphStoreBase,
  listMemberPageNodeIds,
  type RelationshipReadStore,
} from "../graph-store/relationship-read";
import { listSetMemberProjectionPairs } from "../set-membership";
import { resolveContentPath } from "tome-flatfile";

/** In-process sync single-flight: digests currently building. */
const buildsInFlight = new Set<string>();

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
): MemberPageExpressionIndexSort[] {
  return withProfilingSpan(
    "exprIndex.ensureAll",
    "INTERNAL",
    {
      "exprIndex.plan_count": plans.length,
    },
    () => {
      const cache = getQueryCache(store);
      if (!cache || typeof cache.replaceExpressionIndexValues !== "function") {
        throw new Error("Expression indexes require a SQLite query cache");
      }

      const dir =
        contentDir ??
        (isGraphStoreBase(store) ? store.contentDir : resolveContentPath());
      const projections = listSetMemberProjectionPairs(dir);
      const memberIds =
        projections.length > 0
          ? listMemberPageNodeIds(store, ownerId, { projections })
          : [];

      for (const plan of plans) {
        ensureExpressionIndex(cache, store, plan, memberIds, dir);
      }

      return plans.map((plan) => ({ column: plan.column, digest: plan.digest }));
    },
  );
}

/** @deprecated Prefer ensureDynSortIndexes */
export function ensureFixedDynSortIndexes(
  store: RelationshipReadStore,
  ownerId: string,
  plans: readonly DynSortIndexPlan[],
  contentDir?: string,
): MemberPageExpressionIndexSort[] {
  return ensureDynSortIndexes(store, ownerId, plans, contentDir);
}

function expressionJsonForPlan(
  plan: DynSortIndexPlan,
  contentDir?: string,
): string {
  const spec =
    plan.dimensionId != null
      ? columnSetAggregateForResolver(plan.resolverId)
      : fixedAggregateForResolver(plan.resolverId);
  const reachTypes = spec
    ? collectExpressionIndexReachTypes(spec, plan.params, plan.owner, contentDir)
    : [];
  return JSON.stringify({
    resolverId: plan.resolverId,
    columnKey: plan.column,
    owner: plan.owner,
    dimensionId: plan.dimensionId ?? null,
    reachTypes,
  });
}

function evaluatePlanValues(
  store: RelationshipReadStore,
  plan: DynSortIndexPlan,
  rowNodeIds: readonly string[],
): { memberId: string; sortValue: number }[] {
  const ctx = {
    db: store,
    owner: plan.owner,
    viewName: "",
    rowNodeIds: [...rowNodeIds],
  };
  const values =
    plan.dimensionId != null
      ? evaluateColumnSetAggregate(ctx, plan.resolverId, plan.params, plan.dimensionId)
      : evaluateFixedAggregate(ctx, plan.resolverId, plan.params);
  const rows = [...values.entries()].map(([memberId, sortValue]) => ({
    memberId,
    sortValue,
  }));
  const seen = new Set(rows.map((r) => r.memberId));
  for (const id of rowNodeIds) {
    if (!seen.has(id)) rows.push({ memberId: id, sortValue: 0 });
  }
  return rows;
}

function ensureExpressionIndex(
  cache: TomeQueryCache,
  store: RelationshipReadStore,
  plan: DynSortIndexPlan,
  memberIds: readonly string[],
  contentDir?: string,
): void {
  const status = cache.getExpressionIndexStatus(plan.digest);
  const attrs: Record<string, string | number | boolean> = {
    "exprIndex.digest": plan.digest,
    "exprIndex.status": status ?? "missing",
    "exprIndex.path": "skip",
  };

  withProfilingSpan("exprIndex.ensure", "INTERNAL", attrs, () => {
    if (status === "ready") {
      attrs["exprIndex.path"] = "skip";
      return;
    }

    if (buildsInFlight.has(plan.digest)) {
      // Another caller on this stack owns the build; skip duplicate work.
      attrs["exprIndex.path"] = "skip";
      attrs["exprIndex.in_flight"] = true;
      return;
    }

    buildsInFlight.add(plan.digest);
    try {
      const expressionJson = expressionJsonForPlan(plan, contentDir);
      const dirtyIds =
        typeof cache.getExpressionIndexDirtyMemberIds === "function"
          ? cache.getExpressionIndexDirtyMemberIds(plan.digest)
          : null;

      const canPatch =
        status === "stale" &&
        dirtyIds != null &&
        dirtyIds.length > 0 &&
        typeof cache.upsertExpressionIndexValues === "function" &&
        typeof cache.deleteExpressionIndexValues === "function";

      if (canPatch) {
        attrs["exprIndex.path"] = "patch";
        const memberSet = new Set(memberIds);
        const stillMembers = dirtyIds.filter((id) => memberSet.has(id));
        const removed = dirtyIds.filter((id) => !memberSet.has(id));
        if (removed.length > 0) {
          cache.deleteExpressionIndexValues(plan.digest, removed);
        }
        if (stillMembers.length > 0) {
          const rows = evaluatePlanValues(store, plan, stillMembers);
          cache.upsertExpressionIndexValues(plan.digest, expressionJson, rows);
        } else {
          // Only removals — mark ready without re-evaluating.
          cache.upsertExpressionIndexValues(plan.digest, expressionJson, []);
        }
        return;
      }

      attrs["exprIndex.path"] = "rebuild";
      const rows = evaluatePlanValues(store, plan, memberIds);
      cache.replaceExpressionIndexValues(plan.digest, expressionJson, rows);
    } finally {
      buildsInFlight.delete(plan.digest);
    }
  });
}
