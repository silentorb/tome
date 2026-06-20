import {
  isTomeHref,
  nodeIdFromHref,
  nodeIdFromUri,
  standaloneNodeUrl,
  type AppView,
} from "../shared/types";
import { DYNAMIC_NODE_EDITOR_QUERY_PARAM } from "tome-db/dynamic-node-links";
import { resolveMarkdownHrefTarget } from "tome-db/markdown-links";

const RECORD_ID_PATTERN = /^[a-f0-9]{32}$/i;

export function isNodeId(value: string): boolean {
  return RECORD_ID_PATTERN.test(value);
}

export function resolveGraphExplorerAnchor(
  anchorId: string | null | undefined,
  defaultAnchorId: string,
): string {
  if (anchorId && isNodeId(anchorId)) return anchorId.toLowerCase();
  return defaultAnchorId.toLowerCase();
}

export function anchorFromLocation(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const anchor = new URLSearchParams(window.location.search).get("anchor");
  return anchor && isNodeId(anchor) ? anchor.toLowerCase() : undefined;
}

export function resolveNodeLinkTarget(href: string): string | null {
  return resolveMarkdownHrefTarget(href) ?? nodeIdFromHref(href);
}

/** Resolve a navigable node id from any in-app link href (?node=, tome://, legacy export paths). */
export function resolveNodePageTarget(href: string, base?: string | URL): string | null {
  if (typeof window !== "undefined" && isStandaloneNodeHref(href, base)) {
    try {
      const url = new URL(href, base ?? window.location.href);
      const nodeParam =
        url.searchParams.get("node") ?? url.searchParams.get(DYNAMIC_NODE_EDITOR_QUERY_PARAM);
      if (nodeParam && isNodeId(nodeParam)) return nodeParam.toLowerCase();
    } catch {
      /* fall through */
    }
  }
  const fromUri = nodeIdFromUri(href);
  if (fromUri) return fromUri;
  return resolveNodeLinkTarget(href);
}

/** True when href already targets a standalone node URL. */
export function isStandaloneNodeHref(href: string, base?: string | URL): boolean {
  if (typeof window === "undefined") return false;
  try {
    const url = new URL(href, base ?? window.location.href);
    const nodeParam =
      url.searchParams.get("node") ?? url.searchParams.get(DYNAMIC_NODE_EDITOR_QUERY_PARAM);
    return nodeParam !== null && /^[a-f0-9]{32}$/i.test(nodeParam);
  } catch {
    return false;
  }
}

/**
 * @deprecated Display hrefs are set in markdown via `prepareEditorMarkdown` before Milkdown loads.
 */
export function rewriteEditorNodeLinks(root: ParentNode, base?: string | URL): void {
  if (typeof window === "undefined") return;
  const baseUrl = base ?? window.location.href;
  for (const anchor of root.querySelectorAll("a[href]")) {
    const href = anchor.getAttribute("href") ?? "";
    if (isStandaloneNodeHref(href, baseUrl)) continue;
    const nodeId = resolveNodePageTarget(href, baseUrl);
    if (!nodeId) continue;
    anchor.setAttribute("href", nodePageHref(nodeId, baseUrl));
    anchor.removeAttribute("target");
  }
}

/** @deprecated Use rewriteEditorNodeLinks */
export function rewriteStandaloneNodeLinks(root: ParentNode, base?: string | URL): void {
  rewriteEditorNodeLinks(root, base);
}

export function metadataExpandedFromLocation(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("meta") === "1";
}

export function syncMetadataExpandedParam(expanded: boolean, base?: string | URL): void {
  if (typeof window === "undefined") return;
  const url = base instanceof URL ? new URL(base.href) : new URL(base ?? window.location.href);
  if (expanded) url.searchParams.set("meta", "1");
  else url.searchParams.delete("meta");
  replaceStandaloneHistory(url.toString());
}

/** Update the current history entry without adding a back-stack frame. */
export function replaceStandaloneHistory(url: string): void {
  if (typeof window === "undefined") return;
  window.history.replaceState({}, "", url);
}

export function stripMetadataParamFromUrl(url: URL): void {
  url.searchParams.delete("meta");
}

export function standaloneViewUrl(
  view: AppView,
  nodeId?: string | null,
  base?: string | URL,
  anchorId?: string | null,
  defaultAnchorId = "",
): string {
  const url = base instanceof URL ? new URL(base.href) : new URL(base ?? window.location.href);
  if (view === "graph-explorer") {
    url.searchParams.set("view", "explorer");
    url.searchParams.set("anchor", resolveGraphExplorerAnchor(anchorId, defaultAnchorId));
  } else url.searchParams.delete("view");
  if (nodeId) url.searchParams.set("node", nodeId);
  else url.searchParams.delete("node");
  stripMetadataParamFromUrl(url);
  if (view !== "graph-explorer") url.searchParams.delete("anchor");
  return url.toString();
}

/** Href for opening a node page from app chrome (native navigation; no per-link click handlers). */
export function nodePageHref(nodeId: string, base?: string | URL): string {
  return standaloneNodeUrl(nodeId, base);
}

export function navigateStandaloneNode(nodeId: string, base?: string | URL): void {
  window.location.assign(standaloneNodeUrl(nodeId, base));
}

/** URL that triggers automatic new-page creation on load (`?view=create`). */
export function standaloneCreatePageUrl(base?: string | URL): string {
  const url = base instanceof URL ? new URL(base.href) : new URL(base ?? window.location.href);
  url.searchParams.set("view", "create");
  url.searchParams.delete("node");
  url.searchParams.delete("tab");
  url.searchParams.delete("scope");
  url.searchParams.delete("dbView");
  url.searchParams.delete("anchor");
  stripMetadataParamFromUrl(url);
  return url.toString();
}

export function isStandaloneCreatePageUrl(url: URL = new URL(window.location.href)): boolean {
  return url.searchParams.get("view") === "create";
}

export function openStandaloneNodeInNewTab(nodeId: string, base?: string | URL): void {
  const anchor = document.createElement("a");
  anchor.href = standaloneNodeUrl(nodeId, base);
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.click();
}
