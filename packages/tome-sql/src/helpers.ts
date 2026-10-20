import type { RelationFieldLink } from "./types";

export const MEMBER_ID_TOKEN = "{{memberId}}";
export const MEMBER_ROW_TOKEN = "{{memberRow}}";

export function isSafeSqlPropertyKey(key: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key);
}

export function isSafeProjectionType(type: string): boolean {
  return /^[A-Za-z0-9_.:-]+$/.test(type.trim());
}

export function isSafeRelationFieldColumn(key: string): boolean {
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
