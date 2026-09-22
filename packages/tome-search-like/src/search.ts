import type { SearcherHost } from "tome-interfaces/search";
import type { TomeQueryCache } from "tome-service-interfaces";
import { createLikeSearch } from "./like-search";

/**
 * Registers the SQL LIKE searcher (`implementationId: "tome-search-like"`).
 * Requires `SearcherOpenContext.host.getQueryCache()` from ExtensionServerRuntime.
 */
export function register(host: SearcherHost): void {
  host.registerSearcher({
    implementationId: "tome-search-like",
    open(ctx) {
      const cache = ctx.host?.getQueryCache?.() as TomeQueryCache | undefined;
      if (!cache) {
        throw new Error("tome-search-like requires host.getQueryCache");
      }
      return createLikeSearch(cache);
    },
  });
}
