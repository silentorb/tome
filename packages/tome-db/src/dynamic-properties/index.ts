import type { GraphDatabase } from "tome-sqlite";
import type { EvalRow } from "../row-sort";
import { applyDynamicProperties as enrichEvalRows, type DynamicEnrichmentResult } from "./enrich";
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

export function applyDynamicProperties(
  db: GraphDatabase,
  owner: string,
  viewName: string,
  evalRows: EvalRow[],
  registry: ResolverRegistry = getDefaultResolverRegistry(),
  options?: import("./enrich").ApplyDynamicPropertiesOptions,
): DynamicEnrichmentResult {
  return enrichEvalRows(db, owner, viewName, evalRows, registry, options);
}

export {
  loadDynamicColumnSets,
  loadDynamicProperties,
  seedDynamicColumnSet,
  seedDynamicProperty,
} from "./overlay";
export type { DynamicColumnSetRecord, DynamicPropertyRecord } from "./overlay";
export type { DynamicEnrichmentResult, ApplyDynamicPropertiesOptions } from "./enrich";
