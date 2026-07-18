import type { ExtensionSqlQueryServices } from "tome-interfaces/extension-services/sql-query";
import type { TomeQueryCache } from "tome-service-interfaces";

/**
 * Host-mediated SQL for extension page blocks. Prefer Imp-compiled parameterized SQL only.
 */
export function createExtensionSqlQueryServices(
  cache: TomeQueryCache,
): ExtensionSqlQueryServices {
  return {
    queryAll(sql: string, params: readonly unknown[] = []): Record<string, unknown>[] {
      return cache.queryAll<Record<string, unknown>>(sql, ...params);
    },
  };
}
