import type { SearchMatchPreview } from "tome-graph-interfaces";
import { buildSearchMatchPreview } from "./match-preview";

/** Normalize offset/limit for `TomeSearch.searchWindow`. */
export function resolveSearchWindowBounds(request: {
  offset?: number;
  limit?: number | null;
}): {
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

/** Empty `allowedNodeIds` means no matches (scoped table `q` with empty membership). */
export function isEmptyAllowedNodeIds(
  allowedNodeIds: ReadonlySet<string> | undefined,
): boolean {
  return allowedNodeIds != null && allowedNodeIds.size === 0;
}

/** Attach `matchPreview` from body text when the query hits. */
export function mapSearchHitsWithPreview(
  rows: ReadonlyArray<{ id: string; title: string; body?: string | null }>,
  query: string,
): Array<{ id: string; title: string; matchPreview?: SearchMatchPreview }> {
  const trimmed = query.trim();
  return rows.map((row) => {
    const hit: { id: string; title: string; matchPreview?: SearchMatchPreview } = {
      id: row.id,
      title: row.title,
    };
    const preview = buildSearchMatchPreview(row.body ?? "", trimmed);
    if (preview) hit.matchPreview = preview;
    return hit;
  });
}
