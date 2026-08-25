import type { GraphDatabase } from "tome-sqlite";
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
  db: GraphDatabase,
  row: { id: string; title: string },
): NodeSummary {
  return {
    id: row.id,
    title: row.title,
    primaryTypeTitle: primaryTypeTitleForInstance(db, row.id),
  };
}

function attachMatchPreviews(
  db: GraphDatabase,
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
  db: GraphDatabase,
  limit = 20,
  allowedTypeIds?: readonly string[],
): NodeSummary[] {
  const maxCap = allowedTypeIds && allowedTypeIds.length > 0 ? 5000 : 100;
  const cap = Math.max(1, Math.min(limit, maxCap));
  return db.listNodesByTitle(cap, allowedTypeIds).map((row) => toActiveNodeSummary(db, row));
}

/**
 * Tome text-search adapter: always scans title and body; title hits rank above body-only hits.
 */
export function performTomeTextSearch(
  db: GraphDatabase,
  query: string,
  limit = 20,
  allowedTypeIds?: readonly string[],
): NodeSummary[] {
  const trimmed = query.trim();
  const maxCap = allowedTypeIds && allowedTypeIds.length > 0 ? 5000 : 100;
  const cap = Math.max(1, Math.min(limit, maxCap));
  if (!trimmed) {
    return listRecentNodes(db, cap, allowedTypeIds);
  }

  const pattern = `%${trimmed.replace(/[%_\\]/g, "\\$&")}%`;
  const titleRows = db.searchNodesByTitle(pattern, maxCap, allowedTypeIds);
  let summaries = sortBySearchRelevance(
    titleRows.map((row) => toActiveNodeSummary(db, row)),
    trimmed,
    (row) => row.title,
  );

  const seen = new Set(summaries.map((row) => row.id));
  const bodyRows = db.searchNodesByBody(pattern, maxCap, allowedTypeIds);
  const bodyOnlySummaries = sortBySearchRelevance(
    bodyRows
      .filter((row) => !seen.has(row.id))
      .map((row) => toActiveNodeSummary(db, row)),
    trimmed,
    (row) => row.title,
  );
  summaries = [...summaries, ...bodyOnlySummaries].slice(0, cap);

  attachMatchPreviews(db, summaries, trimmed);
  return summaries;
}

/** @deprecated Use performTomeTextSearch */
export function searchNodes(
  db: GraphDatabase,
  query: string,
  limit = 20,
  allowedTypeIds?: readonly string[],
): NodeSummary[] {
  return performTomeTextSearch(db, query, limit, allowedTypeIds);
}

export function listRecentNodesByModifiedAt(
  db: GraphDatabase,
  limit = 20,
  allowedTypeIds?: readonly string[],
): NodeSummary[] {
  const cap = Math.max(1, Math.min(limit, 100));
  return db.listNodesByModifiedAt(cap, allowedTypeIds).map((row) => toActiveNodeSummary(db, row));
}
