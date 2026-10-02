import type { RelationshipReadStore } from "../graph-store/relationship-read";
import { listRelationshipsFromSource } from "../graph-store/relationship-read";
import { SET_TRAIT, typesWithTrait } from "tome-ontology";
import {
  isOrderedTraitComposite,
  loadRelationshipRuntimeFromContent,
  loadRelationshipTypesFromContent,
  memberSideProjectionType,
  orderedPropertyName,
  resolveContentPath,
} from "tome-flatfile";
import {
  firstRelatedNodeId,
  loadSemanticRelatedPathContext,
  type SemanticRelatedPathContext,
} from "../semantic-related-ids";
import { listSetMemberRowConnections } from "../set-membership";
import type { RelationScopeLayerConfig, RelationScopeTab } from "tome-graph-interfaces";
import { numericSortKey, nodeTitle } from "./helpers";

async function scopeMembershipSortKey(
  db: RelationshipReadStore,
  scopeNodeId: string,
  contentDir: string,
): Promise<number> {
  const runtime = loadRelationshipRuntimeFromContent(contentDir);
  const registry = loadRelationshipTypesFromContent(contentDir);
  for (const composite of typesWithTrait(runtime, SET_TRAIT)) {
    if (!isOrderedTraitComposite(registry, composite)) continue;
    const def = registry.relationshipTypes[composite];
    if (!def) continue;
    const memberProjection = memberSideProjectionType(registry, composite);
    const property = orderedPropertyName(def);
    for (const edge of await listRelationshipsFromSource(db, scopeNodeId, memberProjection)) {
      return numericSortKey(edge.properties[property], 999);
    }
  }
  return 999;
}

/** Discover distinct related scope nodes among type-table members. */
export async function discoverRelationScopes(
  db: RelationshipReadStore,
  typeDatabaseId: string,
  config: RelationScopeLayerConfig,
  contentDir?: string,
  pathContext?: SemanticRelatedPathContext,
): Promise<RelationScopeTab[]> {
  const dir = contentDir ?? resolveContentPath();
  const ctx = pathContext ?? loadSemanticRelatedPathContext(dir);
  const scopeIds = new Set<string>();

  for (const connection of await listSetMemberRowConnections(db, typeDatabaseId, dir)) {
    const scopeId = await firstRelatedNodeId(
      db,
      connection.sourceNodeId,
      config.memberToScopeComposite,
      typeDatabaseId,
      ctx,
    );
    if (scopeId) scopeIds.add(scopeId);
  }

  const scopesWithKeys = await Promise.all(
    [...scopeIds].map(async (id) => ({
      id,
      name: await nodeTitle(db, id),
      sortKey: await scopeMembershipSortKey(db, id, dir),
    })),
  );
  scopesWithKeys.sort((a, b) => {
    if (a.sortKey !== b.sortKey) return a.sortKey - b.sortKey;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
  const scopes: RelationScopeTab[] = scopesWithKeys.map(({ id, name }) => ({ id, name }));

  return scopes;
}

/** Whether a member belongs to the given scope tab. */
export async function memberMatchesScope(
  db: RelationshipReadStore,
  memberId: string,
  config: RelationScopeLayerConfig,
  scopeId: string,
  startType: string,
  pathContext: SemanticRelatedPathContext,
): Promise<boolean> {
  return (
    (await firstRelatedNodeId(
      db,
      memberId,
      config.memberToScopeComposite,
      startType,
      pathContext,
    )) === scopeId
  );
}
