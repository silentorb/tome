import type { Database } from "bun:sqlite";
import type {
  TomeSearch,
  TomeSearchHit,
  TomeSearchRequest,
  TomeSearchWindowRequest,
  TomeSearchWindowResult,
} from "tome-interfaces/search";
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

function resolveWindowBounds(request: TomeSearchWindowRequest): {
  offset: number;
  limit: number | null;
} {
  const offsetRaw = request.offset;
  const offset =
    typeof offsetRaw === "number" && Number.isFinite(offsetRaw) && offsetRaw > 0
      ? Math.floor(offsetRaw)
      : 0;
  const limitRaw = request.limit;
  if (limitRaw === undefined || limitRaw === null) {
    return { offset, limit: null };
  }
  const limit =
    typeof limitRaw === "number" && Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.floor(limitRaw)
      : null;
  return { offset, limit };
}

function buildFtsFilters(
  allowedTypeIds: readonly string[] | undefined,
  allowedNodeIds: ReadonlySet<string> | undefined,
): { sql: string; params: Array<string | number> } {
  const filterParts: string[] = [];
  const params: Array<string | number> = [];

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

  return { sql: filterParts.join(" "), params };
}

function mapHits(
  rows: { id: string; title: string; body: string }[],
  query: string,
): TomeSearchHit[] {
  const trimmed = query.trim();
  return rows.map((row) => {
    const hit: TomeSearchHit = { id: row.id, title: row.title };
    const preview = buildSearchMatchPreview(row.body ?? "", trimmed);
    if (preview) hit.matchPreview = preview;
    return hit;
  });
}

export function createFtsSearch(db: Database): TomeSearch {
  return {
    search(request: TomeSearchRequest): TomeSearchHit[] {
      const { query, limit, allowedTypeIds, allowedNodeIds } = request;
      if (allowedNodeIds && allowedNodeIds.size === 0) return [];

      const cap = Math.max(1, Math.min(limit, 100));
      const matchQuery = buildFtsMatchQuery(query);
      if (!matchQuery) return [];

      const filters = buildFtsFilters(allowedTypeIds, allowedNodeIds);
      const params: Array<string | number> = [matchQuery, ...filters.params, cap];

      const rows = db
        .prepare(
          `SELECT nodes_fts.id AS id,
                  ${DISPLAY_TITLE_SQL} AS title,
                  nodes_fts.body AS body,
                  bm25(nodes_fts) AS rank
           FROM nodes_fts
           WHERE nodes_fts MATCH ?
             ${filters.sql}
           ORDER BY rank
           LIMIT ?`,
        )
        .all(...params) as { id: string; title: string; body: string; rank: number }[];

      return mapHits(rows, query);
    },

    searchWindow(request: TomeSearchWindowRequest): TomeSearchWindowResult {
      const { query, allowedTypeIds, allowedNodeIds } = request;
      if (allowedNodeIds && allowedNodeIds.size === 0) {
        return { hits: [], total: 0 };
      }

      const matchQuery = buildFtsMatchQuery(query);
      if (!matchQuery) return { hits: [], total: 0 };

      const filters = buildFtsFilters(allowedTypeIds, allowedNodeIds);
      const { offset, limit } = resolveWindowBounds(request);

      const countRow = db
        .prepare(
          `SELECT COUNT(*) AS c
           FROM nodes_fts
           WHERE nodes_fts MATCH ?
             ${filters.sql}`,
        )
        .get(matchQuery, ...filters.params) as { c: number };
      const total = countRow.c;

      if (total === 0 || offset >= total) {
        return { hits: [], total };
      }

      const selectSql = `SELECT nodes_fts.id AS id,
                  ${DISPLAY_TITLE_SQL} AS title,
                  nodes_fts.body AS body,
                  bm25(nodes_fts) AS rank
           FROM nodes_fts
           WHERE nodes_fts MATCH ?
             ${filters.sql}
           ORDER BY rank`;

      let rows: { id: string; title: string; body: string; rank: number }[];
      if (limit === null) {
        if (offset === 0) {
          rows = db
            .prepare(selectSql)
            .all(matchQuery, ...filters.params) as typeof rows;
        } else {
          rows = db
            .prepare(`${selectSql} LIMIT -1 OFFSET ?`)
            .all(matchQuery, ...filters.params, offset) as typeof rows;
        }
      } else {
        rows = db
          .prepare(`${selectSql} LIMIT ? OFFSET ?`)
          .all(matchQuery, ...filters.params, limit, offset) as typeof rows;
      }

      return { hits: mapHits(rows, query), total };
    },
  };
}
