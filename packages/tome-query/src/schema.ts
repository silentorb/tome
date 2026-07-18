import type { RelationalSchema } from "imp-sql";

const IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/** Map logical Imp column names onto the Tome `nodes` SQLite table. */
export function tomeNodesColumnExpression(name: string): string {
  if (!IDENT_RE.test(name)) {
    throw new Error(`Invalid column name "${name}"`);
  }
  if (name === "id" || name === "is_archived") {
    return name;
  }
  return `json_extract(properties, '$.${name}')`;
}

export const tomeLiveNodesSchema: RelationalSchema = {
  table: "nodes",
  column: tomeNodesColumnExpression,
};

/**
 * Restrict Imp-compiled SQL to live (non-archived) nodes by rewriting `FROM "nodes"`.
 */
export function applyLiveNodesConstraint(
  sql: string,
  parameters: readonly unknown[],
): { sql: string; parameters: unknown[] } {
  if (!/from\s+"nodes"/i.test(sql)) {
    throw new Error('Expected Imp query to select from "nodes"');
  }
  const replaced = sql.replace(
    /from\s+"nodes"/i,
    'from (select * from "nodes" where "is_archived" = 0) as "nodes"',
  );
  return { sql: replaced, parameters: [...parameters] };
}
