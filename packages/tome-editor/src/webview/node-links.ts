import {
  isTomeHref,
  nodeIdFromHref,
  nodeIdFromUri,
  standaloneNodeUrl,
  type AppView,
} from "../shared/types";
import { resolveMarkdownHrefTarget } from "tome-flatfile/markdown-links";
import { NODE_ID_PATTERN } from "tome-flatfile/node-id";

export function isNodeId(value: string): boolean {
  return NODE_ID_PATTERN.test(value);
}

export function resolveGraphExplorerAnchor(
  anchorId: string | null | undefined,
  defaultAnchorId: string,
): string {
  if (anchorId && isNodeId(anchorId)) return anchorId;
  return defaultAnchorId;
}

export function anchorFromLocation(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const anchor = new URLSearchParams(window.location.search).get("anchor");
  return anchor && isNodeId(anchor) ? anchor : undefined;
}

export function resolveNodeLinkTarget(href: string): string | null {
  return resolveMarkdownHrefTarget(href) ?? nodeIdFromHref(href);
}

/** Resolve a navigable node id from any in-app link href (?node=, tome://, ./<id>.md). */
export function resolveNodePageTarget(href: string, base?: string | URL): string | null {
  if (typeof window !== "undefined" && isStandaloneNodeHref(href, base)) {
    try {
      const url = new URL(href, base ?? window.location.href);
      const nodeParam = url.searchParams.get("node");
      if (nodeParam && isNodeId(nodeParam)) return nodeParam;
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
    const nodeParam = url.searchParams.get("node");
    return nodeParam !== null && NODE_ID_PATTERN.test(nodeParam);
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

/** Query param pinning the active corpus on URLs that carry no node id. */
export const CORPUS_PARAM = "corpus";

export function corpusFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(CORPUS_PARAM);
}

export function stripCorpusParamFromUrl(url: URL): void {
  url.searchParams.delete(CORPUS_PARAM);
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

/** Push a new history entry (same-tab SPA navigation). */
export function pushStandaloneHistory(url: string): void {
  if (typeof window === "undefined") return;
  window.history.pushState({}, "", url);
}

export type StandaloneNavigationHandler = () => void | Promise<void>;

let standaloneNavigationHandler: StandaloneNavigationHandler | null = null;

/** Register the App hydrate callback used after soft `pushState` navigation. */
export function setStandaloneNavigationHandler(
  handler: StandaloneNavigationHandler | null,
): void {
  standaloneNavigationHandler = handler;
}

function normalizeHref(url: string, base?: string | URL): string {
  const baseHref =
    base instanceof URL
      ? base.href
      : (base ?? (typeof window !== "undefined" ? window.location.href : "http://127.0.0.1:5173/"));
  return new URL(url, baseHref).toString();
}

function urlsMatchForNavigation(a: string, b: string): boolean {
  try {
    const left = new URL(a);
    const right = new URL(b);
    return left.pathname === right.pathname && left.search === right.search && left.hash === right.hash;
  } catch {
    return a === b;
  }
}

/**
 * Soft-navigate to an in-app URL when a handler is registered; otherwise hard-assign.
 * Pushes a history entry when the URL changes.
 */
export function navigateStandaloneUrl(url: string, base?: string | URL): void {
  const next = normalizeHref(url, base);
  if (standaloneNavigationHandler) {
    if (typeof window !== "undefined" && !urlsMatchForNavigation(window.location.href, next)) {
      pushStandaloneHistory(next);
    }
    void standaloneNavigationHandler();
    return;
  }
  if (typeof window !== "undefined") {
    window.location.assign(next);
  }
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
  stripCorpusParamFromUrl(url);
  if (view !== "graph-explorer") url.searchParams.delete("anchor");
  return url.toString();
}

/** Href for opening a node page from app chrome (`?node=`). */
export function nodePageHref(nodeId: string, base?: string | URL): string {
  return standaloneNodeUrl(nodeId, base);
}

export function navigateStandaloneNode(nodeId: string, base?: string | URL): void {
  navigateStandaloneUrl(standaloneNodeUrl(nodeId, base), base);
}

export function navigateStandaloneView(
  view: AppView,
  nodeId?: string | null,
  base?: string | URL,
  anchorId?: string | null,
  defaultAnchorId = "",
): void {
  navigateStandaloneUrl(standaloneViewUrl(view, nodeId, base, anchorId, defaultAnchorId), base);
}

export function navigateStandaloneCreate(corpusId?: string | null, base?: string | URL): void {
  navigateStandaloneUrl(standaloneCreatePageUrl(corpusId, base), base);
}

/**
 * URL that triggers automatic new-page creation on load (`?view=create`).
 * Carries `corpus` because a create page has no node to infer the corpus from.
 */
export function standaloneCreatePageUrl(
  corpusId?: string | null,
  base?: string | URL,
): string {
  const url = base instanceof URL ? new URL(base.href) : new URL(base ?? window.location.href);
  url.searchParams.set("view", "create");
  if (corpusId) url.searchParams.set(CORPUS_PARAM, corpusId);
  else url.searchParams.delete(CORPUS_PARAM);
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

/** Emulate shift-click hard open in a new browsing context (for non-anchor controls). */
export function openStandaloneNodeInNewWindow(nodeId: string, base?: string | URL): void {
  window.open(standaloneNodeUrl(nodeId, base), "_blank", "noopener,noreferrer");
}
