import type { GraphDatabase, Properties, Relationship } from "./graph";
import type { TomeWriteContext } from "./content/write-context";
import { relationshipId } from "./graph";
import { ORDERED_MEMBER_OF_TYPE } from "./labels";
import { loadRelationshipTypesFromContent } from "./relationship-types/load";
import {
  isOrderedTraitComposite,
  membershipCompositeForSet,
  membershipPerspectivesForSet,
  orderedPropertyName,
} from "./relationship-type-traits";
import { resolveContentPath } from "./content/paths";
import type { RelationshipTypesFile } from "./content/relationship-types-file";
import { listSetMemberRowConnections } from "./set-membership";

export const ORDER_META_KEYS = new Set([
  "ordinal",
  "via_view",
  "view",
  "row_name",
  "order",
  "row_index",
  "number",
]);

function numericOrderValue(raw: unknown, fallback = Number.NaN): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const parsed = Number.parseFloat(String(raw ?? ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function orderPropertyForSet(setId: string, contentDir: string): string {
  const registry = loadRelationshipTypesFromContent(contentDir);
  const composite = membershipCompositeForSet(setId, contentDir);
  const def = registry.types[composite];
  return orderedPropertyName(def);
}

export function listOrderedMemberConnections(
  db: GraphDatabase,
  setId: string,
  contentDir?: string,
): Relationship[] {
  const dir = contentDir ?? resolveContentPath();
  const composite = membershipCompositeForSet(setId, dir);
  const registry = loadRelationshipTypesFromContent(dir);
  if (!isOrderedTraitComposite(registry, composite)) {
    return [];
  }
  return listSetMemberRowConnections(db, setId, dir);
}

export function maxOrderAtSet(
  db: GraphDatabase,
  setId: string,
  contentDir?: string,
): number {
  const dir = contentDir ?? resolveContentPath();
  const property = orderPropertyForSet(setId, dir);
  let max = -1;
  for (const connection of listOrderedMemberConnections(db, setId, dir)) {
    const value = numericOrderValue(connection.properties[property], Number.NaN);
    if (Number.isFinite(value) && value > max) max = value;
  }
  return max;
}

export function stampOrderIfMissing(
  ctx: TomeWriteContext,
  setId: string,
  memberId: string,
  props: Properties,
): Properties {
  const dir = ctx.store.contentDir;
  const registry = loadRelationshipTypesFromContent(dir);
  const composite = membershipCompositeForSet(setId, dir);
  if (!isOrderedTraitComposite(registry, composite)) return props;
  const property = orderedPropertyName(registry.types[composite]);
  if (property in props) return props;
  return { ...props, [property]: maxOrderAtSet(ctx.db, setId, dir) + 1 };
}

export interface SparseOrderRewriteEdge {
  sourceNodeId: string;
  targetNodeId: string;
  type: string;
  properties: Properties;
}

export function applySparseOrderRewrite(
  ctx: TomeWriteContext,
  setId: string,
  edges: SparseOrderRewriteEdge[],
  orderedMemberIds: string[],
): void {
  const dir = ctx.store.contentDir;
  const property = orderPropertyForSet(setId, dir);
  const edgeByMemberId = new Map(
    edges.map((edge) => [edge.sourceNodeId, edge]),
  );

  for (let index = 0; index < orderedMemberIds.length; index++) {
    const memberId = orderedMemberIds[index]!;
    const edge = edgeByMemberId.get(memberId);
    if (!edge) continue;
    const newOrder = (index + 1) * 10;
    ctx.store.mergeRelationshipProperties(
      edge.sourceNodeId,
      edge.targetNodeId,
      edge.type,
      {
        ...edge.properties,
        [property]: String(newOrder),
      },
    );
  }
}

export function isOrderedMembershipComposite(
  registry: RelationshipTypesFile,
  compositeType: string,
): boolean {
  return isOrderedTraitComposite(registry, compositeType);
}

export function orderedMembershipCompositeType(contentDir?: string): string {
  return ORDERED_MEMBER_OF_TYPE;
}

export function memberPerspectiveForSet(setId: string, contentDir?: string): string {
  const [, memberPerspective] = membershipPerspectivesForSet(setId, contentDir);
  return memberPerspective;
}

export function setPerspectiveForSet(setId: string, contentDir?: string): string {
  const [setPerspective] = membershipPerspectivesForSet(setId, contentDir);
  return setPerspective;
}

export function getMembershipRelationship(
  db: GraphDatabase,
  memberId: string,
  setId: string,
  contentDir?: string,
): Relationship | null {
  const dir = contentDir ?? resolveContentPath();
  const composite = membershipCompositeForSet(setId, dir);
  const [, memberPerspective] = membershipPerspectivesForSet(setId, dir);
  const edge = db.getRelationship(relationshipId(memberId, memberPerspective, setId));
  if (edge && edge.type === composite) return edge;
  const [setPerspective] = membershipPerspectivesForSet(setId, dir);
  const viaSet = db.getRelationship(relationshipId(setId, setPerspective, memberId));
  if (viaSet && viaSet.type === composite) {
    return {
      ...viaSet,
      sourceNodeId: memberId,
      targetNodeId: setId,
    };
  }
  return null;
}
