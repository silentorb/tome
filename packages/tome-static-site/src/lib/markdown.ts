import { expandDynamicNodeLinks, parseDynamicNodeLinkIds } from "tome-db/dynamic-node-links";
import { decorateCalloutHtml } from "./callout-html";
import { decorateDynamicLinkHtml } from "./dynamic-link-html";
import { createNodeUrlResolver, type NodeUrlResolver } from "./node-urls";

const LEADING_TITLE_HEADING = /^#\s+(.+?)(?:\n|$)/;

function normalizeNewlines(body: string): string {
  return body.replace(/\r\n/g, "\n");
}

function extractLeadingTitleHeading(body: string): { heading: string; rest: string } | null {
  const normalized = normalizeNewlines(body).trimStart();
  const match = LEADING_TITLE_HEADING.exec(normalized);
  if (!match) return null;
  return {
    heading: match[1]!.trim(),
    rest: normalized.slice(match[0].length).replace(/^\n+/, ""),
  };
}

function titlesMatch(a: string, b: string): boolean {
  return a.trim().localeCompare(b.trim(), undefined, { sensitivity: "accent" }) === 0;
}

/** Strip a leading title heading only when it duplicates the page title. */
export function stripLeadingTitleHeading(body: string, title: string): string {
  const leading = extractLeadingTitleHeading(body);
  if (!leading || !titlesMatch(leading.heading, title)) return body;
  return leading.rest;
}

/**
 * Resolve the page title and body content from stored body + title property.
 * Only a leading `# …` that matches the stored title is treated as a duplicate page title.
 */
export function resolvePageTitleAndContent(
  body: string,
  storedTitle: string,
): { title: string; content: string } {
  const normalized = normalizeNewlines(body).trim();
  const leading = extractLeadingTitleHeading(normalized);
  if (leading && titlesMatch(leading.heading, storedTitle)) {
    return { title: storedTitle.trim(), content: leading.rest };
  }
  return { title: storedTitle.trim(), content: normalized };
}

/** URL path for a node page, including site base when embedded. */
export function nodePagePath(id: string, base = "/", pathById?: Record<string, string>): string {
  const normalizedId = id.toLowerCase();
  const paths = pathById ?? { [normalizedId]: normalizedId };
  return createNodeUrlResolver({ pathById: paths, base }).pagePath(id);
}

/** URL path for a tab sibling page on a type-table hub node. */
export function nodeTabPath(
  id: string,
  tabId: string,
  base = "/",
  pathById?: Record<string, string>,
): string {
  const normalizedId = id.toLowerCase();
  const paths = pathById ?? { [normalizedId]: normalizedId };
  return createNodeUrlResolver({ pathById: paths, base }).tabPath(id, tabId);
}

const MD_LINK = /\[([^\]]*)\]\(([^)]+)\)/g;

/** Rewrite inline markdown links that reference graph nodes to static site URLs. */
export function rewriteMarkdownLinks(body: string, urls: NodeUrlResolver): string {
  return body.replace(MD_LINK, (match, text: string, href: string) => {
    const targetId = urls.resolveHref(href);
    if (!targetId) return match;
    return `[${text}](${urls.pagePath(targetId)})`;
  });
}

export interface PreparedNodeMarkdown {
  markdown: string;
  dynamicNodeIds: Set<string>;
}

/** Prepare node markdown for static rendering. */
export function prepareNodeMarkdown(
  body: string,
  title: string,
  urls: NodeUrlResolver,
  titleForId: (nodeId: string) => string = () => "Untitled",
): PreparedNodeMarkdown {
  const { content } = resolvePageTitleAndContent(body, title);
  const dynamicNodeIds = new Set(parseDynamicNodeLinkIds(content));
  if (!content.trim()) {
    return { markdown: "", dynamicNodeIds };
  }
  const withDynamic = expandDynamicNodeLinks(content, titleForId, (id) => urls.pagePath(id));
  return {
    markdown: rewriteMarkdownLinks(withDynamic, urls),
    dynamicNodeIds,
  };
}

export async function renderMarkdownToHtml(
  markdown: string,
  dynamicNodeIds: ReadonlySet<string> = new Set(),
  urls?: NodeUrlResolver,
): Promise<string> {
  if (!markdown.trim()) return "";
  const { marked } = await import("marked");
  const html = (await marked.parse(markdown, { async: true })) as string;
  return decorateDynamicLinkHtml(decorateCalloutHtml(html), dynamicNodeIds, urls);
}

export type { NodeUrlResolver };
