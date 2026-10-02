import type { RelationshipReadStore } from "./graph-store/relationship-read";
import { readStoreGetNode } from "./graph-store/relationship-read";
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

export async function getNodeDetail(
  db: RelationshipReadStore,
  id: string,
  contentDir?: string,
): Promise<NodeDetail | null> {
  const node = await readStoreGetNode(db, id);
  if (!node) return null;
  return {
    id: node.id,
    title: titleFromProperties(node.properties),
    primaryTypeTitle: await primaryTypeTitleForInstance(db, id),
    body: bodyFromProperties(node.properties),
    isTypeTable: await isTypeTableNode(db, id, contentDir),
    archived: await isArchivedNode(db, id, contentDir),
  };
}

async function touchNodeTimestamps(
  ctx: TomeWriteContext,
  id: string,
  existing: Record<string, unknown>,
): Promise<void> {
  const now = new Date().toISOString();
  const patch: Record<string, string> = { modified_at: now };
  if (typeof existing.created_at !== "string" || !existing.created_at.trim()) {
    patch.created_at = now;
  }
  await ctx.graphStore.mergeNodeProperties(id, patch);
  await syncAfterNodeWrite(ctx, id);
}

export async function updateNodeBody(ctx: TomeWriteContext, id: string, body: string): Promise<boolean> {
  const node = await ctx.graphStore.getNode(id);
  if (!node) return false;
  const { body: _removed, ...props } = node.properties;
  await ctx.graphStore.upsertNode({ id: node.id, properties: props }, body);
  await touchNodeTimestamps(ctx, id, node.properties);
  return true;
}

export async function updateNodeTitle(ctx: TomeWriteContext, id: string, title: string): Promise<boolean> {
  const node = await ctx.graphStore.getNode(id);
  if (!node) return false;
  const trimmed = title.trim();
  if (!isPersistableNodeTitle(trimmed)) return false;
  const oldTitle = titleFromProperties(node.properties);
  const body = bodyFromNode(node);
  const content = stripLeadingTitleHeadingIfMatches(body, oldTitle);
  const { body: _removed, ...rest } = node.properties;
  const props = { ...rest, title: trimmed };
  await ctx.graphStore.upsertNode({ id: node.id, properties: props }, content);
  await touchNodeTimestamps(ctx, id, node.properties);
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
