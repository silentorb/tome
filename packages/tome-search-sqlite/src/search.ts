import type { SearcherHost } from "tome-interfaces/search";
import type { TomeSearch } from "tome-interfaces/search";
import { FtsStore } from "./fts-store";

/**
 * Registers the content searcher (`implementationId: "tome-search-sqlite"`).
 *
 * Prefer host-opened backends via `getSearcherBackend(dataStoreId)` — works for
 * any `TomeSearch` (SQLite FTS5 or same-DB Postgres). Falls back to opening a
 * local FTS5 file from `params.dbPath` when no backend is registered.
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
          `content searcher requires getSearcherBackend("${dataStoreId}") or params.dbPath`,
        );
      }
      const store = new FtsStore({ dbPath });
      const search = store.asSearch();
      return {
        search: (request) => search.search(request),
        searchWindow: (request) => search.searchWindow(request),
        close: () => store.close(),
      };
    },
  });
}
