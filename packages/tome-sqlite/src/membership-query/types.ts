import type { SQLQueryBindings } from "bun:sqlite";

export type SqlFragment = { sql: string; params: SQLQueryBindings[] };

/** Bound expression; SQL may contain `{{memberId}}` / `{{memberRow}}` tokens. */
export type BoundExpr = {
  sql: string;
  params: SQLQueryBindings[];
  /** may contain {{memberId}} */
};

export type MembershipQueryIntent = {
  setId: string;
  projections: { setProjection: string; memberProjection: string }[];
  scope?: { projectionType: string; scopeNodeId: string };
  groups?: {
    memberToGroupProjectionType: string;
    groupTypeDatabaseId: string;
    groupSetProjections: { setProjection: string; memberProjection: string }[];
    groupToScopeProjectionType?: string;
    scopeNodeId?: string;
    canonicalGroupByTitle: boolean;
  };
  sorts: { column: string; direction: "asc" | "desc" }[];
  relationCounts: { column: string; projectionTypes: string[] }[];
  expressionIndexSorts: { column: string; digest: string }[];
  relationFields: {
    column: string;
    projectionTypes: string[];
    compositeType?: string;
  }[];
  defaultOrdered: boolean;
  memberIds?: readonly string[];
  limit: number | null;
  offset: number;
  mode: "page" | "ids";
};

export type ExprCatalog = {
  /** sort key column → bound expr (with {{memberId}} / {{memberRow}}) */
  sorts: Map<string, BoundExpr>;
  /** display column → { alias rf_N, expr with {{memberId}}, params, column key } */
  displays: {
    column: string;
    alias: string;
    sql: string;
    params: SQLQueryBindings[];
  }[];
  /** MEMBER_DISPLAY_TITLE_SQL without member id (uses nodes alias `n`) */
  titleExpr: string;
  /**
   * Edge property order expression for a column key.
   * `memberAlias` is the membership row table alias (`m` / `mwg`).
   */
  edgeOrderExpr: (key: string, memberAlias: string) => string;
};

export type MembershipQueryPlan = {
  intent: MembershipQueryIntent;
  layers: ("memberUniverse" | "scopeFilter" | "groupEnrichment")[];
  includeGroupId: boolean;
  orderKeys: {
    kind: "groupPrefix" | "catalogSort" | "defaultOrder" | "title" | "id";
    column?: string;
    direction?: "asc" | "desc";
  }[];
  catalog: ExprCatalog;
};

export type EmittedSql = {
  /** null when membership projections empty */
  empty: boolean;
  /** full WITH … ending before final SELECT, or empty when empty */
  withSql: string;
  withParams: SQLQueryBindings[];
  /** complete statement or "" */
  countSql: string;
  countParams: SQLQueryBindings[];
  pageSql: string;
  pageParams: SQLQueryBindings[];
  relationColumns: string[];
  includeGroupId: boolean;
  applyLimitOffset: boolean;
};

/** Local shape mirroring SetMemberRelationFieldLink (no service-interfaces import). */
export type RelationFieldLink = {
  targetId: string;
  title: string;
};
