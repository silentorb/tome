import type { MembershipQueryIntent } from "./types";

/** Unified member-page query fields (local mirror; not service-interfaces yet). */
export type MemberPageQueryLike = {
  projections: { setProjection: string; memberProjection: string }[];
  sorts?: { column: string; direction: "asc" | "desc" }[];
  relationCounts?: { column: string; projectionTypes: string[] }[];
  expressionIndexSorts?: { column: string; digest: string }[];
  relationFields?: {
    column: string;
    projectionTypes: string[];
    compositeType?: string;
  }[];
  defaultOrdered?: boolean;
  scope?: { projectionType: string; scopeNodeId: string };
  groups?: {
    memberToGroupProjectionType: string;
    groupTypeDatabaseId: string;
    groupSetProjections: { setProjection: string; memberProjection: string }[];
    groupToScopeProjectionType?: string;
    scopeNodeId?: string;
    canonicalGroupByTitle?: boolean;
  };
  memberIds?: readonly string[];
  limit?: number | null;
  offset?: number;
  mode?: "page" | "ids";
};

function parseLimitOffset(query: {
  limit?: number | null;
  offset?: number;
}): { limit: number | null; offset: number } {
  const offsetRaw = query.offset;
  const offset =
    typeof offsetRaw === "number" && Number.isFinite(offsetRaw) && offsetRaw > 0
      ? Math.floor(offsetRaw)
      : 0;
  const limitRaw = query.limit;
  const limit =
    limitRaw === undefined || limitRaw === null
      ? null
      : typeof limitRaw === "number" && Number.isFinite(limitRaw) && limitRaw > 0
        ? Math.floor(limitRaw)
        : null;
  return { limit, offset };
}

/**
 * Normalize a unified member-page request into a compiler Intent (no SQL).
 */
export function analyzeMemberPage(
  setId: string,
  query: MemberPageQueryLike,
): MembershipQueryIntent {
  const { limit, offset } = parseLimitOffset(query);

  const intent: MembershipQueryIntent = {
    setId,
    projections: (query.projections ?? []).map((pair) => ({
      setProjection: pair.setProjection,
      memberProjection: pair.memberProjection,
    })),
    sorts: (query.sorts ?? []).map((s) => ({
      column: s.column,
      direction: s.direction === "desc" ? "desc" : "asc",
    })),
    relationCounts: (query.relationCounts ?? []).map((r) => ({
      column: r.column,
      projectionTypes: [...r.projectionTypes],
    })),
    expressionIndexSorts: (query.expressionIndexSorts ?? []).map((r) => ({
      column: r.column,
      digest: r.digest,
    })),
    relationFields: (query.relationFields ?? []).map((f) => ({
      column: f.column,
      projectionTypes: [...f.projectionTypes],
      ...(f.compositeType !== undefined
        ? { compositeType: f.compositeType }
        : {}),
    })),
    defaultOrdered: Boolean(query.defaultOrdered),
    limit,
    offset,
    mode: query.mode === "ids" ? "ids" : "page",
  };

  const scopeType = query.scope?.projectionType?.trim();
  const scopeId = query.scope?.scopeNodeId?.trim();
  if (scopeType && scopeId) {
    intent.scope = { projectionType: scopeType, scopeNodeId: scopeId };
  }

  const groups = query.groups;
  if (groups) {
    const memberToGroupProjectionType =
      groups.memberToGroupProjectionType?.trim() ?? "";
    const groupTypeDatabaseId = groups.groupTypeDatabaseId?.trim() ?? "";
    if (memberToGroupProjectionType && groupTypeDatabaseId) {
      const groupToScopeProjectionType =
        groups.groupToScopeProjectionType?.trim() || undefined;
      const groupScopeNodeId =
        (groups.scopeNodeId ?? query.scope?.scopeNodeId)?.trim() || undefined;
      intent.groups = {
        memberToGroupProjectionType,
        groupTypeDatabaseId,
        groupSetProjections: (groups.groupSetProjections ?? []).map((pair) => ({
          setProjection: pair.setProjection,
          memberProjection: pair.memberProjection,
        })),
        ...(groupToScopeProjectionType
          ? { groupToScopeProjectionType }
          : {}),
        ...(groupScopeNodeId ? { scopeNodeId: groupScopeNodeId } : {}),
        canonicalGroupByTitle: groups.canonicalGroupByTitle !== false,
      };
    }
  }

  if (query.memberIds !== undefined) {
    intent.memberIds = query.memberIds;
  }

  return intent;
}
