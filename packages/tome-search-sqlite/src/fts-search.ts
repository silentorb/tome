import type { Database } from "bun:sqlite";
import type { TomeSearch, TomeSearchHit, TomeSearchRequest } from "tome-interfaces/search";
import { buildSearchMatchPreview } from "tome-db";

const DISPLAY_TITLE_SQL = `COALESCE(NULLIF(title, ''), NULLIF(alias, ''), 'Untitled')`;

/** Escape FTS5 special characters; treat the query as a phrase prefix search. */
export function buildFtsMatchQuery(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const escaped = trimmed.replace(/"/g, '""');
  // Phrase match keeps multi-word queries honest; trailing * enables prefix.
  return `"${escaped}"*`;
}

export function createFtsSearch(db: Database): TomeSearch {
  return {
    search(request: TomeSearchRequest): TomeSearchHit[] {
      const { query, limit, allowedTypeIds, allowedNodeIds } = request;
      if (allowedNodeIds && allowedNodeIds.size === 0) return [];

      const cap = Math.max(1, Math.min(limit, 100));
      const matchQuery = buildFtsMatchQuery(query);
      if (!matchQuery) return [];

      const filterParts: string[] = [];
      const params: Array<string | number> = [matchQuery];

      if (allowedNodeIds && allowedNodeIds.size > 0) {
        const ids = [...allowedNodeIds];
        filterParts.push(`AND nodes_fts.id IN (${ids.map(() => "?").join(", ")})`);
        params.push(...ids);
      }

      if (allowedTypeIds && allowedTypeIds.length > 0) {
        const placeholders = allowedTypeIds.map(() => "?").join(", ");
        filterParts.push(`AND EXISTS (
          SELECT 1 FROM node_type_ids t
          WHERE t.node_id = nodes_fts.id AND t.type_id IN (${placeholders})
        )`);
        params.push(...allowedTypeIds);
      }

      params.push(cap);

      const rows = db
        .prepare(
          `SELECT nodes_fts.id AS id,
                  ${DISPLAY_TITLE_SQL} AS title,
                  nodes_fts.body AS body,
                  bm25(nodes_fts) AS rank
           FROM nodes_fts
           WHERE nodes_fts MATCH ?
             ${filterParts.join(" ")}
           ORDER BY rank
           LIMIT ?`,
        )
        .all(...params) as { id: string; title: string; body: string; rank: number }[];

      const trimmed = query.trim();
      return rows.map((row) => {
        const hit: TomeSearchHit = { id: row.id, title: row.title };
        const preview = buildSearchMatchPreview(row.body ?? "", trimmed);
        if (preview) hit.matchPreview = preview;
        return hit;
      });
    },
  };
}
