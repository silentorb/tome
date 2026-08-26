import type { RelationshipReadStore, Properties, Relationship } from "tome-sqlite";
import type { TomeWriteContext } from "./content/write-context";
import { loadAssociationsFromContent } from "tome-flatfile";
import {
  writeStoreContentDir,
  writeStoreMergeRelationshipProperties,
} from "./graph-store/relationship-write";
import {
  associationIdFromTypeOrProjection,
  isOrderedTraitComposite,
  isOrderedSetProjectionType,
  orderedPropertyName,
  setRoleProjectionTypesForNode,
} from "tome-flatfile";
import { resolveContentPath } from "tome-flatfile";
import { listSetMemberRowConnections } from "./set-membership";

export const ORDER_META_KEYS = new Set([
  "ordinal",
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

function orderPropertyForProjection(
  contentDir: string,
  typeOrProjection: string,
): string | null {
  const registry = loadAssociationsFromContent(contentDir);
  const composite = associationIdFromTypeOrProjection(registry, typeOrProjection);
  if (!composite || !isOrderedTraitComposite(registry, composite)) return null;
  return orderedPropertyName(registry.associations[composite]);
}

export function listOrderedMemberConnections(
  db: RelationshipReadStore,
  setId: string,
  contentDir?: string,
): Relationship[] {
  const dir = contentDir ?? resolveContentPath();
  const registry = loadAssociationsFromContent(dir);
  return listSetMemberRowConnections(db, setId, dir).filter((edge) => {
    const composite =
      associationIdFromTypeOrProjection(registry, edge.type) ??
      (isOrderedTraitComposite(registry, edge.type) ? edge.type : null);
    return composite !== null && isOrderedTraitComposite(registry, composite);
  });
}

export function maxOrderAtSet(
  db: RelationshipReadStore,
  setId: string,
  contentDir?: string,
): number {
  return maxOrderAmongMembers(db, setId, null, contentDir);
}

/**
 * Max membership order among set members. When `memberFilter` is set, only those
 * member ids are considered (e.g. members in the active Product scope).
 */
export function maxOrderAmongMembers(
  db: RelationshipReadStore,
  setId: string,
  memberFilter: ReadonlySet<string> | null,
  contentDir?: string,
): number {
  const dir = contentDir ?? resolveContentPath();
  let max = -1;
  for (const connection of listOrderedMemberConnections(db, setId, dir)) {
    if (memberFilter && !memberFilter.has(connection.sourceNodeId)) continue;
    const registry = loadAssociationsFromContent(dir);
    const composite =
      associationIdFromTypeOrProjection(registry, connection.type) ?? connection.type;
    const property = orderedPropertyName(registry.associations[composite]);
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
  projectionType?: string,
  memberFilter?: ReadonlySet<string> | null,
): Properties {
  const dir = writeStoreContentDir(ctx.graphStore);
  const registry = loadAssociationsFromContent(dir);
  const resolvedProjection =
    projectionType ?? setRoleProjectionTypesForNode(setId, dir)[1];
  const composite = associationIdFromTypeOrProjection(registry, resolvedProjection);
  if (!composite || !isOrderedTraitComposite(registry, composite)) return props;
  const property = orderedPropertyName(registry.associations[composite]);
  if (property in props) return props;
  const max = maxOrderAmongMembers(ctx.graphStore, setId, memberFilter ?? null, dir);
  return { ...props, [property]: max + 1 };
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
  const dir = writeStoreContentDir(ctx.graphStore);
  const [, memberProjection] = setRoleProjectionTypesForNode(setId, dir);
  const property = orderPropertyForProjection(dir, memberProjection);
  if (!property) return;
  const edgeByMemberId = new Map(
    edges.map((edge) => [edge.sourceNodeId, edge]),
  );

  for (let index = 0; index < orderedMemberIds.length; index++) {
    const memberId = orderedMemberIds[index]!;
    const edge = edgeByMemberId.get(memberId);
    if (!edge) continue;
    const newOrder = (index + 1) * 10;
    writeStoreMergeRelationshipProperties(
      ctx.graphStore,
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

/** Whether any ordered set-trait association has edges for this set (or views declare ordered). */
export function setUsesOrderedAssociation(setId: string, contentDir?: string): boolean {
  const dir = contentDir ?? resolveContentPath();
  const registry = loadAssociationsFromContent(dir);
  const [setProjection] = setRoleProjectionTypesForNode(setId, dir);
  return isOrderedSetProjectionType(registry, setProjection);
}
