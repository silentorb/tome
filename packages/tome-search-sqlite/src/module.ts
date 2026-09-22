import { FtsStore, type SearchSqliteOpenOptions } from "./fts-store";
import type { SyncEndpoint } from "tome-db/sync";
import type { TomeSearch } from "tome-interfaces/search";

export type { SearchDocument, SearchSqliteOpenOptions } from "./fts-store";

export type SearchSqliteHandle = {
  endpoint: SyncEndpoint;
  search: TomeSearch;
  close(): void;
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
      return {
        endpoint: store.asEndpoint(),
        search: store.asSearch(),
        close: () => store.close(),
      };
    },
  };
}
