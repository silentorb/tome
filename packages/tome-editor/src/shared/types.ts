import {
  canonicalNodeMarkdownHref,
  resolveMarkdownHrefTarget,
  TOME_LINK_SCHEME,
} from "tome-flatfile/markdown-links";
import { NODE_ID_RE_SRC } from "tome-flatfile/node-id";

export { TOME_LINK_SCHEME };

export function isProtectedEditorNode(
  id: string,
  protectedIds: ReadonlySet<string> | readonly string[],
): boolean {
  const ids = Array.isArray(protectedIds) ? protectedIds : [...protectedIds];
  return ids.some((protectedId) => protectedId === id);
}

export type {
  DatabaseTableSection,
  MarkdownSection,
  NodeBacklink,
  NodePageDetail,
  NodePageMetadata,
  NodeSection,
  OrderedAssociationSection,
  PropertiesSection,
  RelationRow,
  RelationTableSection,
} from "tome-db";

export type {
  NodeDetail,
  NodeSummary,
  OrderedAssociationGroup,
  OrderedAssociationRow,
  OrderedAssociationViewDetail,
  TableTabsDetail,
  ViewSortSpec,
  GraphRelationship,
  GraphNode,
  GraphSnapshot,
  GraphLodSnapshot,
  DatabaseColumnDef,
  DatabaseRow,
  DatabaseViewDetail,
  RelationLink,
} from "tome-graph-interfaces";

export type AppView = "node-page" | "graph-explorer";

/** Default title for pages created via New page (sidebar / command). */
export const NEW_PAGE_DEFAULT_TITLE = "Untitled";

export function tomeHref(nodeId: string): string {
  return `${TOME_LINK_SCHEME}${nodeId}`;
}

export function isTomeHref(href: string): boolean {
  return href.startsWith(TOME_LINK_SCHEME);
}

export function nodeIdFromHref(href: string): string | null {
  if (!isTomeHref(href)) return null;
  const id = href.slice(TOME_LINK_SCHEME.length).trim();
  return id || null;
}

export function resolveLinkTarget(href: string): string | null {
  return resolveMarkdownHrefTarget(href);
}

/** Relative href stored in git-tracked node markdown (`content/data/{id}.md`). */
export function nodeMarkdownHref(nodeId: string): string {
  return canonicalNodeMarkdownHref(nodeId);
}

export function formatNodeMarkdownLink(title: string, nodeId: string): string {
  return `[${title}](${nodeMarkdownHref(nodeId)})`;
}

export function nodeUri(nodeId: string): string {
  return `tome://node/${nodeId}`;
}

export function nodeIdFromUri(uri: string): string | null {
  const m = new RegExp(`^(?:tome|marloth)://node/(${NODE_ID_RE_SRC})$`).exec(uri);
  return m?.[1] ?? null;
}

import { stripTableSearchParams } from "./table-search-url";

/** Browser URL for standalone dev mode (`?node=` query param). */
export function standaloneNodeUrl(nodeId: string, base?: string | URL): string {
  const defaultBase =
    typeof window !== "undefined" ? window.location.href : "http://127.0.0.1:5173/";
  const url = base instanceof URL ? new URL(base.href) : new URL(base ?? defaultBase);
  url.searchParams.set("node", nodeId);
  url.searchParams.delete("view");
  url.searchParams.delete("tab");
  url.searchParams.delete("meta");
  stripTableSearchParams(url);
  return url.toString();
}
