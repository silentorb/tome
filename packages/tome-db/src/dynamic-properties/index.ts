import type { EvalRow } from "../row-sort";
import {
  applyDynamicProperties as enrichEvalRows,
  listDynamicColumnDefs as listDynamicColumnDefsFromEnrich,
  type DynamicEnrichmentResult,
} from "./enrich";
import {
  createResolverRegistry,
  registerColumnSetResolver,
  registerFixedResolver,
  type ResolverRegistry,
} from "./registry";
import type { RelationshipReadStore } from "../graph-store/relationship-read";
import {
  buildAllSceneCountPrefetch,
  buildSceneCountByProductPrefetch,
  buildWeightedUsePrefetch,
  buildWonderPrefetch,
  discoverSceneCountByProductDimensions,
  resolveAllSceneCount,
  resolveSceneCountByProduct,
  resolveWeightedUse,
  resolveWonder,
} from "./resolvers/index";

let defaultRegistry: ResolverRegistry | null = null;

export function getDefaultResolverRegistry(): ResolverRegistry {
  if (!defaultRegistry) {
    defaultRegistry = createResolverRegistry();
    registerStarterResolvers(defaultRegistry);
  }
  return defaultRegistry;
}

function registerStarterResolvers(registry: ResolverRegistry): void {
  registerFixedResolver(registry, "characters.allSceneCount", (ctx, params, nodeId, prefetch) =>
    resolveAllSceneCount(ctx, params, nodeId, prefetch ?? buildAllSceneCountPrefetch(ctx, params)),
  );

  registerColumnSetResolver(registry, "characters.sceneCountByProduct", {
    discoverDimensions: discoverSceneCountByProductDimensions,
    buildPrefetch: buildSceneCountByProductPrefetch,
    resolveCell: resolveSceneCountByProduct,
  });

  registerFixedResolver(registry, "inspirations.weightedUse", (ctx, params, nodeId, prefetch) =>
    resolveWeightedUse(ctx, params, nodeId, prefetch ?? buildWeightedUsePrefetch(ctx, params)),
  );

  registerFixedResolver(registry, "inspirations.wonder", (ctx, params, nodeId, prefetch) =>
    resolveWonder(ctx, params, nodeId, prefetch ?? buildWonderPrefetch(ctx, params)),
  );
}

export function applyDynamicProperties(
  db: RelationshipReadStore,
  owner: string,
  viewName: string,
  evalRows: EvalRow[],
  registry: ResolverRegistry = getDefaultResolverRegistry(),
  options?: import("./enrich").ApplyDynamicPropertiesOptions,
): DynamicEnrichmentResult {
  return enrichEvalRows(db, owner, viewName, evalRows, registry, options);
}

export function listDynamicColumnDefs(
  db: RelationshipReadStore,
  owner: string,
  viewName: string,
  registry: ResolverRegistry = getDefaultResolverRegistry(),
  options?: import("./enrich").ApplyDynamicPropertiesOptions,
): import("./enrich").DynamicColumnDefsResult {
  return listDynamicColumnDefsFromEnrich(db, owner, viewName, registry, options);
}

export {
  loadDynamicColumnSets,
  loadDynamicProperties,
  seedDynamicColumnSet,
  seedDynamicProperty,
} from "./overlay";
export type {
  DynamicColumnSetRecord,
  DynamicPropertyRecord,
  SeedDynamicColumnSetInput,
  SeedDynamicPropertyInput,
} from "./overlay";
export type {
  DynamicEnrichmentResult,
  DynamicColumnDefsResult,
  ApplyDynamicPropertiesOptions,
} from "./enrich";
export {
  FIXED_AGGREGATE_BY_RESOLVER,
  COLUMN_SET_AGGREGATE_BY_RESOLVER,
  canonicalizeDynAggregate,
  evaluateFixedAggregate,
  evaluateColumnSetAggregate,
  fixedAggregateForResolver,
  columnSetAggregateForResolver,
  paramsWithDimensionId,
} from "./aggregate";
export type { DynAggregateSpec, ReachSpec } from "./aggregate";
export {
  EXPRESSION_INDEX_FORMAT_VERSION,
  buildExpressionIndexContextFingerprint,
  expressionIndexKeyForFixedDyn,
  expressionIndexKeyForColumnSetDyn,
  hashExpressionIndexKey,
} from "./expression-index-key";
export {
  ensureDynSortIndexes,
  ensureFixedDynSortIndexes,
  planDynSortIndexes,
  planFixedDynSortIndexes,
  sortsIncludeColumnSetDynKey,
} from "./expression-index";
export type { DynSortIndexPlan, FixedDynSortIndexPlan } from "./expression-index";
export { collectExpressionIndexReachTypes } from "./expression-index-reach";
export { parseDimensionIdFromColumnKey, materializeColumnKey } from "./registry";
