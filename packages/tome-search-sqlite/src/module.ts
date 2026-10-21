import { FtsStore, type SearchSqliteOpenOptions } from "./fts-store";
import type { TomeSearchBackend } from "tome-interfaces/search";

export type { SearchDocument, SearchSqliteOpenOptions } from "./fts-store";

/** @deprecated Prefer `TomeSearchBackend` (`syncEndpoint` field). */
export type SearchSqliteHandle = TomeSearchBackend & {
  /** Legacy alias for `syncEndpoint`. */
  endpoint: NonNullable<TomeSearchBackend["syncEndpoint"]>;
};

/**
 * dataStores factory for the FTS5 sync sink + search handle.
 *
 * ```ts
 * {
 *   module: "tome-search-sqlite",
 *   export: "createSearchSqliteModule",
 *   options: { dbPath: ".../tome-fts.sqlite" }
 * }
 * ```
 */
export function createSearchSqliteModule() {
  return {
    id: "tome-search-sqlite",
    open(options: SearchSqliteOpenOptions = {}): SearchSqliteHandle {
      const store = new FtsStore(options);
      const syncEndpoint = store.asEndpoint();
      return {
        syncEndpoint,
        endpoint: syncEndpoint,
        search: store.asSearch(),
        close: () => store.close(),
      };
    },
  };
}
