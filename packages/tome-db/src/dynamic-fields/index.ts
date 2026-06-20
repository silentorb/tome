import type { DatabaseColumnDef } from "../database-view";
import type { GraphDatabase } from "../graph";
import type { EvalRow } from "../row-sort";
import { applyDynamicFields as enrichEvalRows, type DynamicEnrichmentResult } from "./enrich";
import {
  createResolverRegistry,
  registerColumnSetResolver,
  registerFixedResolver,
  type ResolverRegistry,
} from "./registry";
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

export function applyDynamicFields(
  db: GraphDatabase,
  databaseId: string,
  viewName: string,
  evalRows: EvalRow[],
  registry: ResolverRegistry = getDefaultResolverRegistry(),
  options?: import("./enrich").ApplyDynamicFieldsOptions,
): DynamicEnrichmentResult {
  return enrichEvalRows(db, databaseId, viewName, evalRows, registry, options);
}

export {
  loadDynamicColumnSets,
  loadDynamicFields,
  seedDynamicColumnSet,
  seedDynamicField,
} from "./overlay";
export type { DynamicColumnSetRecord, DynamicFieldRecord } from "./overlay";
export type { DynamicEnrichmentResult, ApplyDynamicFieldsOptions } from "./enrich";
