import type { Relationship } from "tome-graph-interfaces";
import { resolveContentPath } from "tome-flatfile";
import { loadAssociationsFromContent } from "tome-flatfile";
import { setTraitProjectionTypes } from "tome-flatfile";
import { priorityWeight } from "../../property-enums";
import type { DynamicResolverContext } from "../registry";
import {
  listRelationshipsFromSource,
  listRelationshipsToTarget,
  readStoreGetNode,
  type RelationshipReadStore,
} from "../../graph-store/relationship-read";
import {
  listRelationshipsForComposite,
  otherEndpoint,
} from "../../relationship-traverse";
import { setMemberIds } from "../../set-membership";

function stringParam(params: Record<string, unknown>, key: string): string {
  return String(params[key] ?? "").trim();
}

function listRelationshipTypesFromComposite(
  db: RelationshipReadStore,
  nodeId: string,
  compositeType: string,
): Relationship[] {
  if (!compositeType) return [];
  return listRelationshipsForComposite(db, nodeId, compositeType);
}

/** Character→scene links via named composite. */
function listCharacterSceneConnections(
  db: RelationshipReadStore,
  nodeId: string,
  params: Record<string, unknown>,
): Relationship[] {
  const composite = stringParam(params, "characters_scene_composite");
  if (!composite) return [];
  return listRelationshipsForComposite(db, nodeId, composite);
}

function relatedProductIdsFromScene(
  db: RelationshipReadStore,
  sceneId: string,
  params: Record<string, unknown>,
): string[] {
  const sceneProductComposite = stringParam(params, "scene_product_composite");
  const productsTableId = stringParam(params, "products_table_id");
  const productLabel = stringParam(params, "product_edge_label");

  if (sceneProductComposite) {
    const candidates = listRelationshipsForComposite(db, sceneId, sceneProductComposite).map(
      (relationship) => otherEndpoint(relationship, sceneId),
    );
    if (productsTableId) {
      const productMembers = new Set(setMemberIds(db, productsTableId));
      return candidates.filter((id) => productMembers.has(id));
    }
    return candidates;
  }

  if (productLabel) {
    return listRelationshipsFromSource(db, sceneId)
      .filter((relationship) => relationship.type === productLabel)
      .map((relationship) => relationship.targetNodeId);
  }

  return [];
}

export { priorityWeight, PRIORITY_WEIGHT } from "../../property-enums";

function titleFromNode(db: RelationshipReadStore, id: string): string {
  const node = readStoreGetNode(db, id);
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
  db: RelationshipReadStore,
  nodeId: string,
  params: Record<string, unknown>,
): number {
  const composite = stringParam(params, "characters_scene_composite");
  const scenesTableId = stringParam(params, "scenes_table_id");
  if (composite || scenesTableId) {
    const compositeCount = listCharacterSceneConnections(db, nodeId, params).length;
    if (compositeCount > 0) return compositeCount;
  }
  const scenesLabel = stringParam(params, "scenes_edge_label");
  if (!scenesLabel) return 0;
  return listRelationshipsFromSource(db, nodeId)
    .filter((relationship) => relationship.type === scenesLabel).length;
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
  const charactersSceneComposite = stringParam(params, "characters_scene_composite");

  const characterSceneProducts = new Map<string, Map<string, string[]>>();
  const productIds = new Set<string>();

  for (const nodeId of ctx.rowNodeIds) {
    const sceneMap = new Map<string, string[]>();

    if (charactersSceneComposite || stringParam(params, "scenes_table_id")) {
      for (const sceneConnection of listCharacterSceneConnections(ctx.db, nodeId, params)) {
        const sceneId = otherEndpoint(sceneConnection, nodeId);
        const products = relatedProductIdsFromScene(ctx.db, sceneId, params);
        if (products.length > 0) {
          sceneMap.set(sceneId, products);
          for (const pid of products) productIds.add(pid);
        }
      }
    }

    if (scenesLabel) {
      for (const sceneConnection of listRelationshipsFromSource(ctx.db, nodeId)) {
        if (sceneConnection.type !== scenesLabel) continue;
        const sceneId = sceneConnection.targetNodeId;
        const products = relatedProductIdsFromScene(ctx.db, sceneId, params);
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
  db: RelationshipReadStore,
  nodeId: string,
  params: Record<string, unknown>,
): Relationship[] {
  const composite = stringParam(params, "inspiration_feature_composite");
  if (composite) {
    const fromComposite = listRelationshipTypesFromComposite(db, nodeId, composite);
    if (fromComposite.length > 0) return fromComposite;
  }
  const featuresLabel = stringParam(params, "features_edge_label");
  if (!featuresLabel) return [];
  return listRelationshipsFromSource(db, nodeId, featuresLabel);
}

export function buildWeightedUsePrefetch(
  ctx: DynamicResolverContext,
  params: Record<string, unknown>,
): WeightedUsePrefetch {
  const featuresTableId = stringParam(params, "features_table_id");

  const priorityByFeature = new Map<string, number>();
  if (featuresTableId) {
    const registry = loadAssociationsFromContent(resolveContentPath());
    for (const type of setTraitProjectionTypes(registry)) {
      for (const connection of listRelationshipsToTarget(ctx.db, featuresTableId, type)) {
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
  const themeLabel = themeLabelRaw;
  const themeTargetId = stringParam(params, "theme_target_id");

  const themedFeatures = new Set<string>();
  if (themeTargetId && themeLabel) {
    for (const connection of listRelationshipsToTarget(ctx.db, themeTargetId)) {
      if (connection.type === themeLabel) {
        themedFeatures.add(connection.sourceNodeId);
      }
    }
    for (const connection of listRelationshipsFromSource(ctx.db, themeTargetId, themeLabel)) {
      themedFeatures.add(connection.targetNodeId);
    }
    for (const connection of listRelationshipsFromSource(ctx.db, themeTargetId)) {
      if (connection.type === themeLabel) {
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

