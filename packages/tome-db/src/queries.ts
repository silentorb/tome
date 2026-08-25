import type { GraphDatabase } from "tome-sqlite";
import { isArchivedNode } from "./archive-status";
import type { TomeWriteContext } from "./content/write-context";
import { syncAfterNodeWrite } from "./content/write-context";
import { bodyFromNode } from "tome-flatfile";
import { isTypeTableNode, primaryTypeTitleForInstance } from "./node-capabilities";
import {
  isPersistableNodeTitle,
  type NodeDetail,
  type NodeSummary,
  type SearchNodesOptions,
} from "tome-graph-interfaces";
import {
  listRecentNodes,
  listRecentNodesByModifiedAt,
  performTomeTextSearch,
  searchNodes,
} from "./search-text";

export type {
  NodeDetail,
  NodeSummary,
  SearchMatchPreview,
  SearchMatchPreviewPart,
  SearchNodesOptions,
} from "tome-graph-interfaces";

export {
  listRecentNodes,
  listRecentNodesByModifiedAt,
  performTomeTextSearch,
  searchNodes,
};

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

export function getNodeDetail(db: GraphDatabase, id: string, contentDir?: string): NodeDetail | null {
  const node = db.getNode(id);
  if (!node) return null;
  return {
    id: node.id,
    title: titleFromProperties(node.properties),
    primaryTypeTitle: primaryTypeTitleForInstance(db, id),
    body: bodyFromProperties(node.properties),
    isTypeTable: isTypeTableNode(db, id, contentDir),
    archived: isArchivedNode(db, id, contentDir),
  };
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
  const trimmed = title.trim();
  if (!isPersistableNodeTitle(trimmed)) return false;
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
