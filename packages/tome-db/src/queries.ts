import type { GraphDatabase } from "./graph";
import { isArchivedNode } from "./archive-status";
import type { TomeWriteContext } from "./content/write-context";
import { syncAfterNodeWrite } from "./content/write-context";
import { bodyFromNode } from "./content/node-file";
import { isTypeTableNode, primaryTypeTitleForInstance } from "./node-capabilities";
import {
  buildSearchMatchPreview,
  type SearchMatchPreview,
} from "./search-match-preview";
import { sortBySearchRelevance } from "./search-relevance";

export type { SearchMatchPreview, SearchMatchPreviewPart } from "./search-match-preview";

export interface NodeSummary {
  id: string;
  title: string;
  primaryTypeTitle: string | null;
  matchPreview?: SearchMatchPreview;
}

export interface NodeDetail extends NodeSummary {
  body: string;
  isTypeTable: boolean;
  archived: boolean;
}

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

export function getNodeDetail(db: GraphDatabase, id: string): NodeDetail | null {
  const node = db.getNode(id);
  if (!node) return null;
  return {
    id: node.id,
    title: titleFromProperties(node.properties),
    primaryTypeTitle: primaryTypeTitleForInstance(db, id),
    body: bodyFromProperties(node.properties),
    isTypeTable: isTypeTableNode(db, id),
    archived: isArchivedNode(db, id),
  };
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

export interface SearchNodesOptions {
  includeBody?: boolean;
}

export function searchNodes(
  db: GraphDatabase,
  query: string,
  limit = 20,
  allowedTypeIds?: readonly string[],
  options?: SearchNodesOptions,
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

  if (!options?.includeBody) {
    return summaries.slice(0, cap);
  }

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

export function listRecentNodesByModifiedAt(
  db: GraphDatabase,
  limit = 20,
  allowedTypeIds?: readonly string[],
): NodeSummary[] {
  const cap = Math.max(1, Math.min(limit, 100));
  return db.listNodesByModifiedAt(cap, allowedTypeIds).map((row) => toActiveNodeSummary(db, row));
}

function touchNodeTimestamps(
  ctx: TomeWriteContext,
  id: string,
  existing: Record<string, unknown>,
): void {
  const now = new Date().toISOString();
  const patch: Record<string, string> = { modified_at: now };
  if (typeof existing.created_at !== "string" || !existing.created_at.trim()) {
    patch.created_at = now;
  }
  ctx.store.mergeNodeProperties(id, patch);
  syncAfterNodeWrite(ctx, id);
}

export function updateNodeBody(ctx: TomeWriteContext, id: string, body: string): boolean {
  const node = ctx.store.readNode(id);
  if (!node) return false;
  const { body: _removed, ...props } = node.properties;
  ctx.store.writeNode({ id: node.id, properties: props }, body);
  touchNodeTimestamps(ctx, id, node.properties);
  return true;
}

export function updateNodeTitle(ctx: TomeWriteContext, id: string, title: string): boolean {
  const node = ctx.store.readNode(id);
  if (!node) return false;
  const trimmed = title.trim() || "Untitled";
  const oldTitle = titleFromProperties(node.properties);
  const body = bodyFromNode(node);
  const content = stripLeadingTitleHeadingIfMatches(body, oldTitle);
  const { body: _removed, ...rest } = node.properties;
  const props = { ...rest, title: trimmed };
  ctx.store.writeNode({ id: node.id, properties: props }, content);
  touchNodeTimestamps(ctx, id, node.properties);
  return true;
}

function stripLeadingTitleHeadingIfMatches(body: string, title: string): string {
  const normalized = body.replace(/\r\n/g, "\n").trimStart();
  const match = /^#\s+(.+?)(?:\n|$)/.exec(normalized);
  if (!match) return body;
  const heading = match[1]!.trim();
  if (heading.localeCompare(title.trim(), undefined, { sensitivity: "accent" }) !== 0) return body;
  return normalized.slice(match[0].length).replace(/^\n+/, "");
}
