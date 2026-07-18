/**
 * Host-mediated SQL execution for extension page blocks (e.g. Imp → SQL).
 * Callers should only pass parameterized SQL from a trusted compiler — not free-form client SQL.
 */
export interface ExtensionSqlQueryServices {
  queryAll(
    sql: string,
    params?: readonly unknown[],
  ): Record<string, unknown>[] | Promise<Record<string, unknown>[]>;
}
