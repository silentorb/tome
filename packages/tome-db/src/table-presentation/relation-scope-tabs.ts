import type { RelationshipReadStore } from "../graph-store/relationship-read";
import {
  listRelationshipsFromSource,
  readStoreGetNode,
  readStoreListNodeIds,
} from "../graph-store/relationship-read";
import {
  isOrderedTraitComposite,
  loadAssociationsFromContent,
  memberSideProjectionType,
  orderedPropertyName,
  resolveContentPath,
  SET_TRAIT,
  typesWithTrait,
} from "tome-flatfile";
import { firstRelatedNodeId } from "../relationship-traverse";
import { listSetMemberRowConnections } from "../set-membership";
import type { RelationScopeLayerConfig, RelationScopeTab } from "tome-graph-interfaces";
import { numericSortKey, nodeTitle } from "./helpers";

function scopeMembershipSortKey(
  db: RelationshipReadStore,
  scopeNodeId: string,
  contentDir: string,
): number {
  const registry = loadAssociationsFromContent(contentDir);
  for (const composite of typesWithTrait(registry, SET_TRAIT)) {
    if (!isOrderedTraitComposite(registry, composite)) continue;
    const def = registry.associations[composite];
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
): RelationScopeTab[] {
  const dir = contentDir ?? resolveContentPath();
  const scopeIds = new Set<string>();

  for (const connection of listSetMemberRowConnections(db, typeDatabaseId, dir)) {
    const scopeId = firstRelatedNodeId(db, connection.sourceNodeId, config.memberToScopeComposite);
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
): boolean {
  return firstRelatedNodeId(db, memberId, config.memberToScopeComposite) === scopeId;
}
