import type { SearcherHost } from "tome-interfaces/search";
import type { TomeSearch } from "tome-interfaces/search";
import { FtsStore } from "./fts-store";

/**
 * Registers the FTS5 searcher (`implementationId: "tome-search-sqlite"`).
 *
 * Resolves the opened FTS handle via `host.getSearcherBackend(dataStoreId)`
 * (default dataStore id `"fts"`), or opens a search-only connection from
 * `params.dbPath`.
 */
export function register(host: SearcherHost): void {
  host.registerSearcher({
    implementationId: "tome-search-sqlite",
    open(ctx) {
      const dataStoreId = String(ctx.params.dataStoreId ?? ctx.dataStoreId ?? "fts");
      const backend = ctx.host?.getSearcherBackend?.(dataStoreId);
      if (backend && typeof (backend as TomeSearch).search === "function") {
        return backend as TomeSearch;
      }

      const dbPath =
        typeof ctx.params.dbPath === "string" ? ctx.params.dbPath.trim() : "";
      if (!dbPath) {
        throw new Error(
          'tome-search-sqlite requires getSearcherBackend("fts") or params.dbPath',
        );
      }
      const store = new FtsStore({ dbPath });
      const search = store.asSearch();
      return {
        search: (request) => search.search(request),
        close: () => store.close(),
      };
    },
  });
}
