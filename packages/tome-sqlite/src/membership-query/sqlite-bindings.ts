import type { SQLQueryBindings } from "bun:sqlite";
import type { SqlParam } from "tome-sql";

/** Narrow dialect-neutral params for bun:sqlite `.get` / `.all` spreads. */
export function asSqliteBindings(
  params: readonly SqlParam[],
): SQLQueryBindings[] {
  return params as SQLQueryBindings[];
}
