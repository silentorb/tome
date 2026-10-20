/** Dialect-agnostic SQL bind parameter (SQLite / Postgres drivers narrow as needed). */
export type SqlParam = unknown;

export type SqlFragment = { sql: string; params: SqlParam[] };

/** Bound expression; SQL may contain `{{memberId}}` / `{{memberRow}}` tokens. */
export type BoundExpr = {
  sql: string;
  params: SqlParam[];
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
  intrinsicSequence: boolean;
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
    params: SqlParam[];
  }[];
  /** Display title SQL fragment (uses nodes alias `n`) */
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
    kind: "groupPrefix" | "catalogSort" | "intrinsicSequence" | "title" | "id";
    column?: string;
    direction?: "asc" | "desc";
  }[];
  catalog: ExprCatalog;
};

export type EmittedSql = {
  /** true when membership projections empty or empty memberIds */
  empty: boolean;
  /** full WITH … ending before final SELECT, or empty when empty */
  withSql: string;
  withParams: SqlParam[];
  /** complete statement or "" */
  countSql: string;
  countParams: SqlParam[];
  pageSql: string;
  pageParams: SqlParam[];
  relationColumns: string[];
  includeGroupId: boolean;
  applyLimitOffset: boolean;
};

/** Local shape mirroring SetMemberRelationFieldLink (no service-interfaces import). */
export type RelationFieldLink = {
  targetId: string;
  title: string;
};
