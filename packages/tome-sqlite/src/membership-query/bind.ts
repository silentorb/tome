import type { SQLQueryBindings } from "bun:sqlite";
import type {
  BoundExpr,
  ExprCatalog,
  MembershipQueryIntent,
  RelationFieldLink,
} from "./types";

export const MEMBER_ID_TOKEN = "{{memberId}}";
export const MEMBER_ROW_TOKEN = "{{memberRow}}";

export const MEMBER_DISPLAY_TITLE_SQL = `COALESCE(NULLIF(n.title, ''), NULLIF(n.alias, ''), 'Untitled')`;

const RELATION_LINK_TITLE_SQL = `COALESCE(NULLIF(n.title, ''), NULLIF(n.alias, ''), 'Untitled')`;

export function isSafeSqlPropertyKey(key: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key);
}

export function isSafeProjectionType(type: string): boolean {
  return /^[A-Za-z0-9_.:-]+$/.test(type.trim());
}

function isSafeRelationFieldColumn(key: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key.trim());
}

/**
 * Replace plan tokens with concrete member-id expression and row-table alias.
 */
export function substituteTokens(
  sql: string,
  memberIdExpr: string,
  memberRowAlias: string,
): string {
  return sql
    .split(MEMBER_ID_TOKEN)
    .join(memberIdExpr)
    .split(MEMBER_ROW_TOKEN)
    .join(memberRowAlias);
}

function edgePropertyOrderExpression(propertyKey: string): string {
  if (propertyKey === "ordinal") return `${MEMBER_ROW_TOKEN}.ordinal`;
  if (propertyKey === "order") return `${MEMBER_ROW_TOKEN}."order"`;
  if (propertyKey === "priority") return `${MEMBER_ROW_TOKEN}.priority`;
  return `(SELECT json_extract(value, '$') FROM relationship_projection_properties WHERE projection_id = ${MEMBER_ROW_TOKEN}.id AND key = '${propertyKey}')`;
}

export function memberEdgeOrderExpr(
  propertyKey: string,
  memberAlias: string,
): string {
  return substituteTokens(
    edgePropertyOrderExpression(propertyKey),
    `${memberAlias}.member_id`,
    memberAlias,
  );
}

function relationLinksSubquerySql(
  memberIdExpr: string,
  typePlaceholders: string,
  options?: { compositeTypeParam?: boolean },
): string {
  const compositeJoin = options?.compositeTypeParam
    ? `INNER JOIN relationship_records r ON r.id = rp.record_id AND r.composite_type = ?`
    : "";
  return `(
    SELECT COALESCE(json_group_array(
      json_object('targetId', x.target_id, 'title', x.title)
    ), '[]')
    FROM (
      SELECT rp.target_node_id AS target_id,
             ${RELATION_LINK_TITLE_SQL} AS title
      FROM relationship_projections rp
      ${compositeJoin}
      LEFT JOIN nodes n ON n.id = rp.target_node_id
      WHERE rp.source_node_id = ${memberIdExpr}
        AND rp.type IN (${typePlaceholders})
      ORDER BY CASE WHEN rp.ordinal IS NULL THEN 1 ELSE 0 END ASC,
               rp.ordinal ASC,
               rp.id ASC
    ) AS x
  )`;
}

function relationFieldExistsSql(
  memberIdExpr: string,
  typePlaceholders: string,
): string {
  return `EXISTS (
    SELECT 1
    FROM relationship_projections rp
    INNER JOIN relationship_records r ON r.id = rp.record_id AND r.composite_type = ?
    WHERE rp.source_node_id = ${memberIdExpr}
      AND rp.type IN (${typePlaceholders})
  )`;
}

/**
 * Lower Intent sort keys and relation display fields into a shared expression catalog.
 */
export function bindExpressions(intent: MembershipQueryIntent): ExprCatalog {
  const sorts = new Map<string, BoundExpr>();

  for (const sort of intent.sorts) {
    const col = sort.column.trim();
    if (!col) continue;
    if (col === "name") {
      if (!isSafeSqlPropertyKey(col)) continue;
      sorts.set(col, {
        sql: `${MEMBER_DISPLAY_TITLE_SQL} COLLATE NOCASE`,
        params: [],
      });
      continue;
    }
    if (!isSafeSqlPropertyKey(col)) continue;

    const exprEntry = intent.expressionIndexSorts.find((r) => r.column === col);
    if (exprEntry && /^[a-f0-9]{16,64}$/i.test(exprEntry.digest.trim())) {
      sorts.set(col, {
        sql: `COALESCE((SELECT eiv.sort_value FROM expression_index_values eiv WHERE eiv.digest = ? AND eiv.member_id = ${MEMBER_ID_TOKEN}), 0)`,
        params: [exprEntry.digest.trim()],
      });
      continue;
    }

    const relationEntry = intent.relationCounts.find((r) => r.column === col);
    if (relationEntry) {
      const safeTypes = relationEntry.projectionTypes.filter(
        (t) => typeof t === "string" && isSafeProjectionType(t),
      );
      if (safeTypes.length === 0) continue;
      const placeholders = safeTypes.map(() => "?").join(", ");
      sorts.set(col, {
        sql: `(SELECT COUNT(*) FROM relationship_projections rcount WHERE rcount.source_node_id = ${MEMBER_ID_TOKEN} AND rcount.type IN (${placeholders}))`,
        params: safeTypes.map((t) => t.trim()),
      });
      continue;
    }

    sorts.set(col, {
      sql: edgePropertyOrderExpression(col),
      params: [],
    });
  }

  const displays: ExprCatalog["displays"] = [];
  let aliasIndex = 0;
  for (const field of intent.relationFields) {
    const column = field.column.trim();
    if (!column || !isSafeRelationFieldColumn(column)) continue;
    const safeTypes = field.projectionTypes
      .map((t) => t.trim())
      .filter((t) => t.length > 0 && isSafeProjectionType(t));
    if (safeTypes.length === 0) continue;
    const placeholders = safeTypes.map(() => "?").join(", ");
    const alias = `rf_${aliasIndex}`;
    aliasIndex += 1;

    const memberIdExpr = MEMBER_ID_TOKEN;
    const compositeType = field.compositeType?.trim();
    if (compositeType && isSafeProjectionType(compositeType)) {
      const compositeSub = relationLinksSubquerySql(memberIdExpr, placeholders, {
        compositeTypeParam: true,
      });
      const plainSub = relationLinksSubquerySql(memberIdExpr, placeholders);
      const existsSql = relationFieldExistsSql(memberIdExpr, placeholders);
      displays.push({
        column,
        alias,
        sql: `CASE WHEN ${existsSql} THEN ${compositeSub} ELSE ${plainSub} END`,
        params: [
          compositeType,
          ...safeTypes,
          compositeType,
          ...safeTypes,
          ...safeTypes,
        ],
      });
    } else {
      displays.push({
        column,
        alias,
        sql: relationLinksSubquerySql(memberIdExpr, placeholders),
        params: [...safeTypes],
      });
    }
  }

  return {
    sorts,
    displays,
    titleExpr: MEMBER_DISPLAY_TITLE_SQL,
    edgeOrderExpr: memberEdgeOrderExpr,
  };
}

export function parseRelationFieldJson(raw: unknown): RelationFieldLink[] {
  if (raw === null || raw === undefined) return [];
  const text = typeof raw === "string" ? raw : String(raw);
  if (!text || text === "[]") return [];
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!Array.isArray(parsed)) return [];
    const links: RelationFieldLink[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") continue;
      const record = entry as Record<string, unknown>;
      const targetId = record.targetId;
      const title = record.title;
      if (typeof targetId !== "string" || !targetId) continue;
      links.push({
        targetId,
        title:
          typeof title === "string" && title.trim()
            ? title.trim()
            : "Untitled",
      });
    }
    return links;
  } catch {
    return [];
  }
}

export function relationFieldsByRowFromSqlRows(
  rows: Record<string, unknown>[],
  columns: readonly string[],
): Record<string, RelationFieldLink[]>[] {
  if (columns.length === 0) return rows.map(() => ({}));
  return rows.map((row) => {
    const map: Record<string, RelationFieldLink[]> = {};
    for (let i = 0; i < columns.length; i++) {
      map[columns[i]!] = parseRelationFieldJson(row[`rf_${i}`]);
    }
    return map;
  });
}
