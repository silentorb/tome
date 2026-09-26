import type {
  TomeSearch,
  TomeSearchHit,
  TomeSearchRequest,
  TomeSearchWindowRequest,
  TomeSearchWindowResult,
} from "tome-interfaces/search";
import type { TomeQueryCache } from "tome-service-interfaces";
import { sortBySearchRelevance } from "tome-db/search-relevance";

function escapeLikePattern(query: string): string {
  return `%${query.replace(/[%_\\]/g, "\\$&")}%`;
}

/** Generous candidate pool so relevance top-N is not truncated by SQL order. */
const TITLE_CANDIDATE_CAP = 10_000;

/**
 * Title-only LIKE searcher: filter via SQL title LIKE, then rank with
 * exact → prefix → word-boundary → substring (shorter title, localeCompare).
 * No body matches.
 */
export function createLikeSearch(cache: TomeQueryCache): TomeSearch {
  return {
    search(request: TomeSearchRequest): TomeSearchHit[] {
      const { query, limit, allowedTypeIds, allowedNodeIds } = request;
      if (allowedNodeIds && allowedNodeIds.size === 0) return [];

      const cap = Math.max(1, Math.min(limit, 100));
      const trimmed = query.trim();

      if (!trimmed) {
        return cache
          .listNodesByTitle(cap, allowedTypeIds, allowedNodeIds)
          .map((row) => ({ id: row.id, title: row.title }));
      }

      const pattern = escapeLikePattern(trimmed);
      const candidates = cache.searchNodesByTitle(
        pattern,
        TITLE_CANDIDATE_CAP,
        allowedTypeIds,
        allowedNodeIds,
      );
      const ranked = sortBySearchRelevance(candidates, trimmed, (row) => row.title);
      return ranked.slice(0, cap).map((row) => ({ id: row.id, title: row.title }));
    },

    searchWindow(request: TomeSearchWindowRequest): TomeSearchWindowResult {
      const { query, allowedTypeIds, allowedNodeIds } = request;
      if (allowedNodeIds && allowedNodeIds.size === 0) {
        return { hits: [], total: 0 };
      }

      const trimmed = query.trim();
      if (!trimmed) {
        return { hits: [], total: 0 };
      }

      const offsetRaw = request.offset;
      const offset =
        typeof offsetRaw === "number" && Number.isFinite(offsetRaw) && offsetRaw > 0
          ? Math.floor(offsetRaw)
          : 0;
      const limitRaw = request.limit;
      const limit =
        limitRaw === undefined || limitRaw === null
          ? null
          : typeof limitRaw === "number" && Number.isFinite(limitRaw) && limitRaw > 0
            ? Math.floor(limitRaw)
            : null;

      const pattern = escapeLikePattern(trimmed);
      const candidates = cache.searchNodesByTitle(
        pattern,
        TITLE_CANDIDATE_CAP,
        allowedTypeIds,
        allowedNodeIds,
      );
      const ranked = sortBySearchRelevance(candidates, trimmed, (row) => row.title);
      const total = ranked.length;
      const page =
        limit === null ? ranked.slice(offset) : ranked.slice(offset, offset + limit);
      return {
        hits: page.map((row) => ({ id: row.id, title: row.title })),
        total,
      };
    },
  };
}
