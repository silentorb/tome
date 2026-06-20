import type { GraphDatabase, Relationship } from "../../graph";
import { INCLUDES_TYPE } from "../../includes-relationship";
import { TYPE_MEMBERSHIP_TYPES } from "../../labels";
import { priorityWeight } from "../../property-enums";
import { normalizeRelationshipType } from "../../relation-type";
import type { DynamicResolverContext } from "../registry";
import {
  listRelationshipsForComposite,
  otherEndpoint,
} from "../../relationship-traverse";

function stringParam(params: Record<string, unknown>, key: string): string {
  return String(params[key] ?? "").trim();
}

function listAssociationsFromComposite(
  db: GraphDatabase,
  nodeId: string,
  compositeType: string,
): Relationship[] {
  if (!compositeType) return [];
  const includes = listRelationshipsForComposite(db, nodeId, INCLUDES_TYPE);
  if (includes.length > 0) return includes;
  return listRelationshipsForComposite(db, nodeId, compositeType);
}

export { priorityWeight, PRIORITY_WEIGHT } from "../../property-enums";

function titleFromNode(db: GraphDatabase, id: string): string {
  const node = db.getNode(id);
  const title = node?.properties.title;
  return typeof title === "string" && title.trim() ? title.trim() : "Untitled";
}

/** Prefetch: nodeId -> count of SCENES relationships */
export function buildAllSceneCountPrefetch(
  ctx: DynamicResolverContext,
  params: Record<string, unknown>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const nodeId of ctx.rowNodeIds) {
    counts.set(nodeId, countCharacterSceneRelationships(ctx.db, nodeId, params));
  }
  return counts;
}

function countCharacterSceneRelationships(
  db: GraphDatabase,
  nodeId: string,
  params: Record<string, unknown>,
): number {
  const composite = stringParam(params, "characters_scene_composite");
  if (composite) {
    const compositeCount = listAssociationsFromComposite(db, nodeId, composite).length;
    if (compositeCount > 0) return compositeCount;
  }
  const scenesLabel = stringParam(params, "scenes_edge_label");
  if (!scenesLabel) return 0;
  const normalized = normalizeRelationshipType(scenesLabel);
  return db
    .listRelationshipsFromSource(nodeId)
    .filter((relationship) => normalizeRelationshipType(relationship.type) === normalized).length;
}

export function resolveAllSceneCount(
  _ctx: DynamicResolverContext,
  _params: Record<string, unknown>,
  nodeId: string,
  prefetch: unknown,
): string {
  const counts = prefetch as Map<string, number>;
  return String(counts.get(nodeId) ?? 0);
}

export interface SceneCountByProductPrefetch {
  /** characterId -> sceneId -> productId[] */
  characterSceneProducts: Map<string, Map<string, string[]>>;
  dimensions: { id: string; title: string }[];
}

export function buildSceneCountByProductPrefetch(
  ctx: DynamicResolverContext,
  params: Record<string, unknown>,
): SceneCountByProductPrefetch {
  const scenesLabel = stringParam(params, "scenes_edge_label");
  const normalizedScenesLabel = scenesLabel ? normalizeRelationshipType(scenesLabel) : "";
  const charactersSceneComposite = stringParam(params, "characters_scene_composite");
  const sceneProductComposite = stringParam(params, "scene_product_composite");
  const productLabel = stringParam(params, "product_edge_label");
  const normalizedProductLabel = productLabel ? normalizeRelationshipType(productLabel) : "";

  const characterSceneProducts = new Map<string, Map<string, string[]>>();
  const productIds = new Set<string>();

  for (const nodeId of ctx.rowNodeIds) {
    const sceneMap = new Map<string, string[]>();

    if (charactersSceneComposite) {
      for (const sceneConnection of listAssociationsFromComposite(
        ctx.db,
        nodeId,
        charactersSceneComposite,
      )) {
        const sceneId = otherEndpoint(sceneConnection, nodeId);
        const products = sceneProductComposite
          ? relatedNodeIdsFromComposite(ctx.db, sceneId, sceneProductComposite)
          : [];
        if (products.length > 0) {
          sceneMap.set(sceneId, products);
          for (const pid of products) productIds.add(pid);
        }
      }
    }

    if (normalizedScenesLabel) {
      for (const sceneConnection of ctx.db.listRelationshipsFromSource(nodeId)) {
        if (normalizeRelationshipType(sceneConnection.type) !== normalizedScenesLabel) continue;
        const sceneId = sceneConnection.targetNodeId;
        const products = sceneProductComposite
          ? relatedNodeIdsFromComposite(ctx.db, sceneId, sceneProductComposite)
          : [];
        if (products.length === 0 && normalizedProductLabel) {
          const legacyProducts = ctx.db
            .listRelationshipsFromSource(sceneId)
            .filter(
              (relationship) =>
                normalizeRelationshipType(relationship.type) === normalizedProductLabel,
            )
            .map((relationship) => relationship.targetNodeId);
          if (legacyProducts.length > 0) {
            sceneMap.set(sceneId, legacyProducts);
            for (const pid of legacyProducts) productIds.add(pid);
          }
          continue;
        }
        if (products.length > 0) {
          sceneMap.set(sceneId, products);
          for (const pid of products) productIds.add(pid);
        }
      }
    }

    characterSceneProducts.set(nodeId, sceneMap);
  }

  const dimensions = [...productIds]
    .map((id) => ({ id, title: titleFromNode(ctx.db, id) }))
    .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));

  return { characterSceneProducts, dimensions };
}

export function discoverSceneCountByProductDimensions(
  ctx: DynamicResolverContext,
  params: Record<string, unknown>,
): { id: string; title: string }[] {
  return buildSceneCountByProductPrefetch(ctx, params).dimensions;
}

export function resolveSceneCountByProduct(
  _ctx: DynamicResolverContext,
  _params: Record<string, unknown>,
  nodeId: string,
  productId: string,
  prefetch: unknown,
): string {
  const data = prefetch as SceneCountByProductPrefetch;
  const sceneMap = data.characterSceneProducts.get(nodeId);
  if (!sceneMap) return "0";
  let count = 0;
  for (const products of sceneMap.values()) {
    if (products.includes(productId)) count++;
  }
  return String(count);
}

export interface WeightedUsePrefetch {
  /** inspirationId -> sum */
  sums: Map<string, number>;
}

function inspirationFeatureConnections(
  db: GraphDatabase,
  nodeId: string,
  params: Record<string, unknown>,
): Relationship[] {
  const composite = stringParam(params, "inspiration_feature_composite");
  if (composite) {
    const fromComposite = listAssociationsFromComposite(db, nodeId, composite);
    if (fromComposite.length > 0) return fromComposite;
  }
  const featuresLabel = stringParam(params, "features_edge_label");
  if (!featuresLabel) return [];
  return db.listRelationshipsFromSource(nodeId, normalizeRelationshipType(featuresLabel));
}

export function buildWeightedUsePrefetch(
  ctx: DynamicResolverContext,
  params: Record<string, unknown>,
): WeightedUsePrefetch {
  const featuresDbId = stringParam(params, "features_database_id");

  const priorityByFeature = new Map<string, number>();
  if (featuresDbId) {
    for (const type of TYPE_MEMBERSHIP_TYPES) {
      for (const connection of ctx.db.listRelationshipsToTarget(featuresDbId, type)) {
        priorityByFeature.set(connection.sourceNodeId, priorityWeight(connection.properties.priority));
      }
    }
  }

  const sums = new Map<string, number>();
  for (const nodeId of ctx.rowNodeIds) {
    let sum = 0;
    for (const featConnection of inspirationFeatureConnections(ctx.db, nodeId, params)) {
      const featureId = otherEndpoint(featConnection, nodeId);
      sum += priorityByFeature.get(featureId) ?? 0;
    }
    sums.set(nodeId, sum);
  }
  return { sums };
}

export function resolveWeightedUse(
  _ctx: DynamicResolverContext,
  _params: Record<string, unknown>,
  nodeId: string,
  prefetch: unknown,
): string {
  const data = prefetch as WeightedUsePrefetch;
  return String(data.sums.get(nodeId) ?? 0);
}

export interface WonderPrefetch {
  /** inspirationId -> count */
  counts: Map<string, number>;
}

export function buildWonderPrefetch(
  ctx: DynamicResolverContext,
  params: Record<string, unknown>,
): WonderPrefetch {
  const themeLabelRaw = stringParam(params, "theme_edge_label");
  const themeLabel = themeLabelRaw ? normalizeRelationshipType(themeLabelRaw) : "";
  const themeTargetId = stringParam(params, "theme_target_id");

  const themedFeatures = new Set<string>();
  if (themeTargetId && themeLabel) {
    for (const connection of ctx.db.listRelationshipsToTarget(themeTargetId)) {
      if (normalizeRelationshipType(connection.type) === themeLabel) {
        themedFeatures.add(connection.sourceNodeId);
      }
    }
    for (const connection of ctx.db.listRelationshipsFromSource(themeTargetId, themeLabel)) {
      themedFeatures.add(connection.targetNodeId);
    }
    for (const connection of ctx.db.listRelationshipsFromSource(themeTargetId)) {
      if (normalizeRelationshipType(connection.type) === themeLabel) {
        themedFeatures.add(connection.targetNodeId);
      }
    }
  }

  const counts = new Map<string, number>();
  for (const nodeId of ctx.rowNodeIds) {
    let count = 0;
    for (const featConnection of inspirationFeatureConnections(ctx.db, nodeId, params)) {
      const featureId = otherEndpoint(featConnection, nodeId);
      if (themedFeatures.has(featureId)) count++;
    }
    counts.set(nodeId, count);
  }
  return { counts };
}

export function resolveWonder(
  _ctx: DynamicResolverContext,
  _params: Record<string, unknown>,
  nodeId: string,
  prefetch: unknown,
): string {
  const data = prefetch as WonderPrefetch;
  return String(data.counts.get(nodeId) ?? 0);
}

function relatedNodeIdsFromComposite(
  db: GraphDatabase,
  nodeId: string,
  compositeType: string,
): string[] {
  if (!compositeType) return [];
  return listRelationshipsForComposite(db, nodeId, compositeType).map((relationship) =>
    otherEndpoint(relationship, nodeId),
  );
}
