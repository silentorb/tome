import type {
  TomeSearch,
  TomeSearchHit,
  TomeSearchRequest,
  TomeSearchWindowRequest,
  TomeSearchWindowResult,
} from "tome-interfaces/search";
import type { TomeQueryCache } from "tome-service-interfaces";
import { buildSearchMatchPreview } from "tome-db";

function escapeLikePattern(query: string): string {
  return `%${query.replace(/[%_\\]/g, "\\$&")}%`;
}

function bodyFromProperties(properties: Record<string, unknown>): string {
  const body = properties.body;
  return typeof body === "string" ? body : "";
}

function attachMatchPreviews(
  cache: TomeQueryCache,
  hits: TomeSearchHit[],
  query: string,
): void {
  for (const hit of hits) {
    const node = cache.getNode(hit.id);
    const body = bodyFromProperties(node?.properties ?? {});
    const preview = buildSearchMatchPreview(body, query);
    if (preview) hit.matchPreview = preview;
  }
}

/**
 * SQL LIKE searcher: title hits before body-only hits; order is SQL `title COLLATE NOCASE`.
 * No TypeScript relevance reordering.
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
      const titleRows = cache.searchNodesByTitle(
        pattern,
        cap,
        allowedTypeIds,
        allowedNodeIds,
      );
      const hits: TomeSearchHit[] = titleRows.map((row) => ({
        id: row.id,
        title: row.title,
      }));
      const seen = new Set(hits.map((h) => h.id));

      if (hits.length < cap) {
        const bodyRows = cache.searchNodesByBody(
          pattern,
          cap,
          allowedTypeIds,
          allowedNodeIds,
        );
        for (const row of bodyRows) {
          if (seen.has(row.id)) continue;
          hits.push({ id: row.id, title: row.title });
          seen.add(row.id);
          if (hits.length >= cap) break;
        }
      }

      attachMatchPreviews(cache, hits, trimmed);
      return hits;
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

      const pattern = escapeLikePattern(trimmed);
      const { rows, total } = cache.searchNodesLikeWindow(pattern, {
        offset: request.offset,
        limit: request.limit,
        allowedTypeIds,
        allowedNodeIds,
      });

      const hits: TomeSearchHit[] = rows.map((row) => ({
        id: row.id,
        title: row.title,
      }));
      attachMatchPreviews(cache, hits, trimmed);
      return { hits, total };
    },
  };
}
