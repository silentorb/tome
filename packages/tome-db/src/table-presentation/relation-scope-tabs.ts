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

function scopeMembershipSortKey(
  db: RelationshipReadStore,
  scopeNodeId: string,
  contentDir: string,
): number {
  const runtime = loadRelationshipRuntimeFromContent(contentDir);
  const registry = loadRelationshipTypesFromContent(contentDir);
  for (const composite of typesWithTrait(runtime, SET_TRAIT)) {
    if (!isOrderedTraitComposite(registry, composite)) continue;
    const def = registry.relationshipTypes[composite];
    if (!def) continue;
    const memberProjection = memberSideProjectionType(registry, composite);
    const property = orderedPropertyName(def);
    for (const edge of listRelationshipsFromSource(db, scopeNodeId, memberProjection)) {
      return numericSortKey(edge.properties[property], 999);
    }
  }
  return 999;
}

/** Discover distinct related scope nodes among type-table members. */
export function discoverRelationScopes(
  db: RelationshipReadStore,
  typeDatabaseId: string,
  config: RelationScopeLayerConfig,
  contentDir?: string,
  pathContext?: SemanticRelatedPathContext,
): RelationScopeTab[] {
  const dir = contentDir ?? resolveContentPath();
  const ctx = pathContext ?? loadSemanticRelatedPathContext(dir);
  const scopeIds = new Set<string>();

  for (const connection of listSetMemberRowConnections(db, typeDatabaseId, dir)) {
    const scopeId = firstRelatedNodeId(
      db,
      connection.sourceNodeId,
      config.memberToScopeComposite,
      typeDatabaseId,
      ctx,
    );
    if (scopeId) scopeIds.add(scopeId);
  }

  const scopes: RelationScopeTab[] = [];
  for (const id of scopeIds) {
    scopes.push({ id, name: nodeTitle(db, id) });
  }

  scopes.sort((a, b) => {
    const keyA = scopeMembershipSortKey(db, a.id, dir);
    const keyB = scopeMembershipSortKey(db, b.id, dir);
    if (keyA !== keyB) return keyA - keyB;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });

  return scopes;
}

/** Whether a member belongs to the given scope tab. */
export function memberMatchesScope(
  db: RelationshipReadStore,
  memberId: string,
  config: RelationScopeLayerConfig,
  scopeId: string,
  startType: string,
  pathContext: SemanticRelatedPathContext,
): boolean {
  return (
    firstRelatedNodeId(
      db,
      memberId,
      config.memberToScopeComposite,
      startType,
      pathContext,
    ) === scopeId
  );
}
