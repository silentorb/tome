import type { Relationship } from "tome-graph-interfaces";
import { resolveContentPath } from "tome-flatfile";
import { loadRelationshipTypesFromContent } from "tome-flatfile";
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

async function listRelationshipTypesFromComposite(
  db: RelationshipReadStore,
  nodeId: string,
  compositeType: string,
): Promise<Relationship[]> {
  if (!compositeType) return [];
  return await listRelationshipsForComposite(db, nodeId, compositeType);
}

/** Character→scene links via named composite. */
async function listCharacterSceneConnections(
  db: RelationshipReadStore,
  nodeId: string,
  params: Record<string, unknown>,
): Promise<Relationship[]> {
  const composite = stringParam(params, "characters_scene_composite");
  if (!composite) return [];
  return await listRelationshipsForComposite(db, nodeId, composite);
}

async function relatedProductIdsFromScene(
  db: RelationshipReadStore,
  sceneId: string,
  params: Record<string, unknown>,
): Promise<string[]> {
  const sceneProductComposite = stringParam(params, "scene_product_composite");
  const productsTableId = stringParam(params, "products_table_id");
  const productLabel = stringParam(params, "product_edge_label");

  if (sceneProductComposite) {
    const candidates = (await listRelationshipsForComposite(db, sceneId, sceneProductComposite)).map(
      (relationship) => otherEndpoint(relationship, sceneId),
    );
    if (productsTableId) {
      const productMembers = new Set(await setMemberIds(db, productsTableId));
      return candidates.filter((id) => productMembers.has(id));
    }
    return candidates;
  }

  if (productLabel) {
    return (await listRelationshipsFromSource(db, sceneId))
      .filter((relationship) => relationship.type === productLabel)
      .map((relationship) => relationship.targetNodeId);
  }

  return [];
}

export { priorityWeight, PRIORITY_WEIGHT } from "../../property-enums";

async function titleFromNode(db: RelationshipReadStore, id: string): Promise<string> {
  const node = await readStoreGetNode(db, id);
  const title = node?.properties.title;
  return typeof title === "string" && title.trim() ? title.trim() : "Untitled";
}

/** Prefetch: nodeId -> count of SCENES relationships */
export async function buildAllSceneCountPrefetch(
  ctx: DynamicResolverContext,
  params: Record<string, unknown>,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const nodeId of ctx.rowNodeIds) {
    counts.set(nodeId, await countCharacterSceneRelationships(ctx.db, nodeId, params));
  }
  return counts;
}

async function countCharacterSceneRelationships(
  db: RelationshipReadStore,
  nodeId: string,
  params: Record<string, unknown>,
): Promise<number> {
  const composite = stringParam(params, "characters_scene_composite");
  const scenesTableId = stringParam(params, "scenes_table_id");
  if (composite || scenesTableId) {
    const compositeCount = (await listCharacterSceneConnections(db, nodeId, params)).length;
    if (compositeCount > 0) return compositeCount;
  }
  const scenesLabel = stringParam(params, "scenes_edge_label");
  if (!scenesLabel) return 0;
  return (await listRelationshipsFromSource(db, nodeId))
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

export async function buildSceneCountByProductPrefetch(
  ctx: DynamicResolverContext,
  params: Record<string, unknown>,
): Promise<SceneCountByProductPrefetch> {
  const scenesLabel = stringParam(params, "scenes_edge_label");
  const charactersSceneComposite = stringParam(params, "characters_scene_composite");

  const characterSceneProducts = new Map<string, Map<string, string[]>>();
  const productIds = new Set<string>();

  for (const nodeId of ctx.rowNodeIds) {
    const sceneMap = new Map<string, string[]>();

    if (charactersSceneComposite || stringParam(params, "scenes_table_id")) {
      for (const sceneConnection of await listCharacterSceneConnections(ctx.db, nodeId, params)) {
        const sceneId = otherEndpoint(sceneConnection, nodeId);
        const products = await relatedProductIdsFromScene(ctx.db, sceneId, params);
        if (products.length > 0) {
          sceneMap.set(sceneId, products);
          for (const pid of products) productIds.add(pid);
        }
      }
    }

    if (scenesLabel) {
      for (const sceneConnection of await listRelationshipsFromSource(ctx.db, nodeId)) {
        if (sceneConnection.type !== scenesLabel) continue;
        const sceneId = sceneConnection.targetNodeId;
        const products = await relatedProductIdsFromScene(ctx.db, sceneId, params);
        if (products.length > 0) {
          sceneMap.set(sceneId, products);
          for (const pid of products) productIds.add(pid);
        }
      }
    }

    characterSceneProducts.set(nodeId, sceneMap);
  }

  const dimensions = await Promise.all(
    [...productIds].map(async (id) => ({ id, title: await titleFromNode(ctx.db, id) })),
  );
  dimensions.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));

  return { characterSceneProducts, dimensions };
}

export async function discoverSceneCountByProductDimensions(
  ctx: DynamicResolverContext,
  params: Record<string, unknown>,
): Promise<{ id: string; title: string }[]> {
  return (await buildSceneCountByProductPrefetch(ctx, params)).dimensions;
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

async function inspirationFeatureConnections(
  db: RelationshipReadStore,
  nodeId: string,
  params: Record<string, unknown>,
): Promise<Relationship[]> {
  const composite = stringParam(params, "inspiration_feature_composite");
  if (composite) {
    const fromComposite = await listRelationshipTypesFromComposite(db, nodeId, composite);
    if (fromComposite.length > 0) return fromComposite;
  }
  const featuresLabel = stringParam(params, "features_edge_label");
  if (!featuresLabel) return [];
  return await listRelationshipsFromSource(db, nodeId, featuresLabel);
}

export async function buildWeightedUsePrefetch(
  ctx: DynamicResolverContext,
  params: Record<string, unknown>,
): Promise<WeightedUsePrefetch> {
  const featuresTableId = stringParam(params, "features_table_id");

  const priorityByFeature = new Map<string, number>();
  if (featuresTableId) {
    const registry = loadRelationshipTypesFromContent(resolveContentPath());
    for (const type of setTraitProjectionTypes(registry)) {
      for (const connection of await listRelationshipsToTarget(ctx.db, featuresTableId, type)) {
        priorityByFeature.set(connection.sourceNodeId, priorityWeight(connection.properties.priority));
      }
    }
  }

  const sums = new Map<string, number>();
  for (const nodeId of ctx.rowNodeIds) {
    let sum = 0;
    for (const featConnection of await inspirationFeatureConnections(ctx.db, nodeId, params)) {
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

export async function buildWonderPrefetch(
  ctx: DynamicResolverContext,
  params: Record<string, unknown>,
): Promise<WonderPrefetch> {
  const themeLabelRaw = stringParam(params, "theme_edge_label");
  const themeLabel = themeLabelRaw;
  const themeTargetId = stringParam(params, "theme_target_id");

  const themedFeatures = new Set<string>();
  if (themeTargetId && themeLabel) {
    for (const connection of await listRelationshipsToTarget(ctx.db, themeTargetId)) {
      if (connection.type === themeLabel) {
        themedFeatures.add(connection.sourceNodeId);
      }
    }
    for (const connection of await listRelationshipsFromSource(ctx.db, themeTargetId, themeLabel)) {
      themedFeatures.add(connection.targetNodeId);
    }
    for (const connection of await listRelationshipsFromSource(ctx.db, themeTargetId)) {
      if (connection.type === themeLabel) {
        themedFeatures.add(connection.targetNodeId);
      }
    }
  }

  const counts = new Map<string, number>();
  for (const nodeId of ctx.rowNodeIds) {
    let count = 0;
    for (const featConnection of await inspirationFeatureConnections(ctx.db, nodeId, params)) {
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

