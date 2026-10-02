import type { TomeQueryCache } from "tome-service-interfaces";
import { primaryTypeTitleForInstance } from "./node-capabilities";
import { buildSearchMatchPreview } from "./search-match-preview";
import type { NodeSummary } from "tome-graph-interfaces";

function bodyFromProperties(properties: Record<string, unknown>): string {
  const body = properties.body;
  return typeof body === "string" ? body : "";
}

async function toActiveNodeSummary(
  db: TomeQueryCache,
  row: { id: string; title: string },
): Promise<NodeSummary> {
  return {
    id: row.id,
    title: row.title,
    primaryTypeTitle: await primaryTypeTitleForInstance(db, row.id),
  };
}

async function attachMatchPreviews(
  db: TomeQueryCache,
  summaries: NodeSummary[],
  query: string,
): Promise<void> {
  for (const summary of summaries) {
    const node = await db.getNode(summary.id);
    const body = bodyFromProperties(node?.properties ?? {});
    const preview = buildSearchMatchPreview(body, query);
    if (preview) summary.matchPreview = preview;
  }
}

/**
 * Title-ordered browse (empty search query). Filters push into SQL via the cache API.
 */
export async function listRecentNodes(
  db: TomeQueryCache,
  limit = 20,
  allowedTypeIds?: readonly string[],
  allowedNodeIds?: ReadonlySet<string>,
): Promise<NodeSummary[]> {
  if (allowedNodeIds && allowedNodeIds.size === 0) return [];
  const cap = Math.max(1, Math.min(limit, 100));
  const rows = await db.listNodesByTitle(cap, allowedTypeIds, allowedNodeIds);
  return Promise.all(rows.map((row) => toActiveNodeSummary(db, row)));
}

/**
 * @deprecated Prefer an injected TomeSearch (tome-search-like / tome-search-sqlite).
 * Kept for tests that still call the legacy adapter; SQL order only (no relevance ranking).
 */
export async function performTomeTextSearch(
  db: TomeQueryCache,
  query: string,
  limit = 20,
  allowedTypeIds?: readonly string[],
  allowedNodeIds?: ReadonlySet<string>,
): Promise<NodeSummary[]> {
  if (allowedNodeIds && allowedNodeIds.size === 0) return [];
  const trimmed = query.trim();
  const cap = Math.max(1, Math.min(limit, 100));
  if (!trimmed) {
    return listRecentNodes(db, cap, allowedTypeIds, allowedNodeIds);
  }

  const pattern = `%${trimmed.replace(/[%_\\]/g, "\\$&")}%`;
  const titleRows = await db.searchNodesByTitle(pattern, cap, allowedTypeIds, allowedNodeIds);
  const summaries = await Promise.all(titleRows.map((row) => toActiveNodeSummary(db, row)));
  const seen = new Set(summaries.map((row) => row.id));

  if (summaries.length < cap) {
    const bodyRows = await db.searchNodesByBody(pattern, cap, allowedTypeIds, allowedNodeIds);
    for (const row of bodyRows) {
      if (seen.has(row.id)) continue;
      summaries.push(await toActiveNodeSummary(db, row));
      seen.add(row.id);
      if (summaries.length >= cap) break;
    }
  }

  await attachMatchPreviews(db, summaries, trimmed);
  return summaries;
}

/** @deprecated Use performTomeTextSearch or an injected TomeSearch */
export async function searchNodes(
  db: TomeQueryCache,
  query: string,
  limit = 20,
  allowedTypeIds?: readonly string[],
): Promise<NodeSummary[]> {
  return performTomeTextSearch(db, query, limit, allowedTypeIds);
}

export async function listRecentNodesByModifiedAt(
  db: TomeQueryCache,
  limit = 20,
  allowedTypeIds?: readonly string[],
): Promise<NodeSummary[]> {
  const cap = Math.max(1, Math.min(limit, 100));
  const rows = await db.listNodesByModifiedAt(cap, allowedTypeIds);
  return Promise.all(rows.map((row) => toActiveNodeSummary(db, row)));
}
