import type { TomeQueryCache } from "tome-service-interfaces";
import { primaryTypeTitleForInstance } from "./node-capabilities";
import { buildSearchMatchPreview } from "./search-match-preview";
import type { NodeSummary } from "tome-graph-interfaces";

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

/**
 * Title-ordered browse (empty search query). Filters push into SQL via the cache API.
 */
export function listRecentNodes(
  db: TomeQueryCache,
  limit = 20,
  allowedTypeIds?: readonly string[],
  allowedNodeIds?: ReadonlySet<string>,
): NodeSummary[] {
  if (allowedNodeIds && allowedNodeIds.size === 0) return [];
  const cap = Math.max(1, Math.min(limit, 100));
  return db
    .listNodesByTitle(cap, allowedTypeIds, allowedNodeIds)
    .map((row) => toActiveNodeSummary(db, row));
}

/**
 * @deprecated Prefer an injected TomeSearch (tome-search-like / tome-search-sqlite).
 * Kept for tests that still call the legacy adapter; SQL order only (no relevance ranking).
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
  const cap = Math.max(1, Math.min(limit, 100));
  if (!trimmed) {
    return listRecentNodes(db, cap, allowedTypeIds, allowedNodeIds);
  }

  const pattern = `%${trimmed.replace(/[%_\\]/g, "\\$&")}%`;
  const titleRows = db.searchNodesByTitle(pattern, cap, allowedTypeIds, allowedNodeIds);
  const summaries = titleRows.map((row) => toActiveNodeSummary(db, row));
  const seen = new Set(summaries.map((row) => row.id));

  if (summaries.length < cap) {
    const bodyRows = db.searchNodesByBody(pattern, cap, allowedTypeIds, allowedNodeIds);
    for (const row of bodyRows) {
      if (seen.has(row.id)) continue;
      summaries.push(toActiveNodeSummary(db, row));
      seen.add(row.id);
      if (summaries.length >= cap) break;
    }
  }

  attachMatchPreviews(db, summaries, trimmed);
  return summaries;
}

/** @deprecated Use performTomeTextSearch or an injected TomeSearch */
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
