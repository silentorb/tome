import type { TomeQueryCache } from "tome-service-interfaces";
import { primaryTypeTitleForInstance } from "./node-capabilities";
import { buildSearchMatchPreview } from "./search-match-preview";
import { sortBySearchRelevance } from "./search-relevance";
import type { NodeSummary } from "tome-graph-interfaces";

function titleFromProperties(properties: Record<string, unknown>): string {
  const title = properties.title;
  if (typeof title === "string" && title.trim()) return title.trim();
  const alias = properties.alias;
  if (typeof alias === "string" && alias.trim()) return alias.trim();
  return "Untitled";
}

function bodyFromProperties(properties: Record<string, unknown>): string {
  const body = properties.body;
  return typeof body === "string" ? body : "";
}

function toActiveNodeSummary(
  db: TomeQueryCache,
  row: { id: string; title: string },
): NodeSummary {
  return {
    id: row.id,
    title: row.title,
    primaryTypeTitle: primaryTypeTitleForInstance(db, row.id),
  };
}

function attachMatchPreviews(
  db: TomeQueryCache,
  summaries: NodeSummary[],
  query: string,
): void {
  for (const summary of summaries) {
    const node = db.getNode(summary.id);
    const body = bodyFromProperties(node?.properties ?? {});
    const preview = buildSearchMatchPreview(body, query);
    if (preview) summary.matchPreview = preview;
  }
}

export function listRecentNodes(
  db: TomeQueryCache,
  limit = 20,
  allowedTypeIds?: readonly string[],
  allowedNodeIds?: ReadonlySet<string>,
): NodeSummary[] {
  if (allowedNodeIds && allowedNodeIds.size === 0) return [];
  const needsOverFetch =
    (allowedTypeIds && allowedTypeIds.length > 0) ||
    (allowedNodeIds !== undefined && allowedNodeIds.size > 0);
  const maxCap = needsOverFetch ? 5000 : 100;
  const cap = Math.max(1, Math.min(limit, maxCap));
  const fetchLimit = needsOverFetch ? maxCap : cap;
  return filterByAllowedNodeIds(
    db.listNodesByTitle(fetchLimit, allowedTypeIds).map((row) => toActiveNodeSummary(db, row)),
    allowedNodeIds,
    cap,
  );
}

function filterByAllowedNodeIds(
  summaries: NodeSummary[],
  allowedNodeIds: ReadonlySet<string> | undefined,
  limit: number,
): NodeSummary[] {
  if (!allowedNodeIds) return summaries.slice(0, limit);
  const matched: NodeSummary[] = [];
  for (const summary of summaries) {
    if (!allowedNodeIds.has(summary.id)) continue;
    matched.push(summary);
    if (matched.length >= limit) break;
  }
  return matched;
}

/**
 * Tome text-search adapter: always scans title and body; title hits rank above body-only hits.
 */
export function performTomeTextSearch(
  db: TomeQueryCache,
  query: string,
  limit = 20,
  allowedTypeIds?: readonly string[],
  allowedNodeIds?: ReadonlySet<string>,
): NodeSummary[] {
  if (allowedNodeIds && allowedNodeIds.size === 0) return [];
  const trimmed = query.trim();
  const needsOverFetch =
    (allowedTypeIds && allowedTypeIds.length > 0) ||
    (allowedNodeIds !== undefined && allowedNodeIds.size > 0);
  const maxCap = needsOverFetch ? 5000 : 100;
  const cap = Math.max(1, Math.min(limit, maxCap));
  if (!trimmed) {
    return listRecentNodes(db, cap, allowedTypeIds, allowedNodeIds);
  }

  const pattern = `%${trimmed.replace(/[%_\\]/g, "\\$&")}%`;
  const titleRows = db.searchNodesByTitle(pattern, maxCap, allowedTypeIds);
  let summaries = sortBySearchRelevance(
    filterByAllowedNodeIds(
      titleRows.map((row) => toActiveNodeSummary(db, row)),
      allowedNodeIds,
      maxCap,
    ),
    trimmed,
    (row) => row.title,
  );

  const seen = new Set(summaries.map((row) => row.id));
  const bodyRows = db.searchNodesByBody(pattern, maxCap, allowedTypeIds);
  const bodyOnlySummaries = sortBySearchRelevance(
    filterByAllowedNodeIds(
      bodyRows
        .filter((row) => !seen.has(row.id))
        .map((row) => toActiveNodeSummary(db, row)),
      allowedNodeIds,
      maxCap,
    ),
    trimmed,
    (row) => row.title,
  );
  summaries = [...summaries, ...bodyOnlySummaries].slice(0, cap);

  attachMatchPreviews(db, summaries, trimmed);
  return summaries;
}

/** @deprecated Use performTomeTextSearch */
export function searchNodes(
  db: TomeQueryCache,
  query: string,
  limit = 20,
  allowedTypeIds?: readonly string[],
): NodeSummary[] {
  return performTomeTextSearch(db, query, limit, allowedTypeIds);
}

export function listRecentNodesByModifiedAt(
  db: TomeQueryCache,
  limit = 20,
  allowedTypeIds?: readonly string[],
): NodeSummary[] {
  const cap = Math.max(1, Math.min(limit, 100));
  return db.listNodesByModifiedAt(cap, allowedTypeIds).map((row) => toActiveNodeSummary(db, row));
}
