/**
 * SQLite-local membership helpers that re-export shared tome-sql utilities
 * plus the SQLite node title expression.
 */
export {
  MEMBER_ID_TOKEN,
  MEMBER_ROW_TOKEN,
  isSafeProjectionType,
  isSafeRelationFieldColumn,
  isSafeSqlPropertyKey,
  parseRelationFieldJson,
  relationFieldsByRowFromSqlRows,
  substituteTokens,
} from "tome-sql";

export const MEMBER_DISPLAY_TITLE_SQL = `COALESCE(NULLIF(n.title, ''), NULLIF(n.alias, ''), 'Untitled')`;
