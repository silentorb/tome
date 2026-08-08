import { NODE_ID_PATTERN, NODE_ID_RE_SRC } from "./node-id";

export const TOME_LINK_SCHEME = "tome:";

const TOME_NODE_URI = new RegExp(`^tome://node/(${NODE_ID_RE_SRC})$`);
const WIKI_LINK = new RegExp(`^\\[\\[(${NODE_ID_RE_SRC})\\]\\]$`);
const CANONICAL_MD_LINK = new RegExp(`^\\./(${NODE_ID_RE_SRC})\\.md$`);
const MD_LINK = /\[([^\]]*)\]\(([^)]+)\)/g;
const PAREN_LINK =
  /(?<!\[)([^\[\]\n(]+?)\s*\(\s*([^)]+?\.(?:md|csv))(?:#([^)]*))?\s*\)(?!\])/g;

function hasDynamicLinkMarker(href: string): boolean {
  const trimmed = href.replace(/\\&/g, "&").replace(/&amp;/g, "&").trim();
  if (!trimmed.startsWith("?") && !trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    return false;
  }
  try {
    const url = trimmed.startsWith("?") ? new URL(trimmed, "http://local/") : new URL(trimmed);
    return url.searchParams.get("dynamicTitle") === "1";
  } catch {
    return false;
  }
}

function nodeIdFromQueryParam(value: string | null): string | null {
  if (!value || !NODE_ID_PATTERN.test(value)) return null;
  return value;
}

function resolveNodeIdFromUrl(href: string): string | null {
  try {
    const url = new URL(href.replace(/\\&/g, "&"));
    return (
      nodeIdFromQueryParam(url.searchParams.get("node")) ??
      nodeIdFromQueryParam(url.searchParams.get("record"))
    );
  } catch {
    return null;
  }
}

function resolveNodeIdFromQueryOnlyHref(href: string): string | null {
  const trimmed = href.replace(/\\&/g, "&").trim();
  if (!trimmed.startsWith("?")) return null;
  const params = new URLSearchParams(trimmed);
  return (
    nodeIdFromQueryParam(params.get("node")) ??
    nodeIdFromQueryParam(params.get("record"))
  );
}

function resolveNodeIdFromInternalUri(trimmed: string): string | null {
  const match = TOME_NODE_URI.exec(trimmed);
  if (match?.[1]) return match[1];
  return null;
}

function resolveNodeIdFromInternalScheme(trimmed: string): string | null {
  if (!trimmed.startsWith(TOME_LINK_SCHEME)) return null;
  const id = trimmed.slice(TOME_LINK_SCHEME.length).trim();
  return id && NODE_ID_PATTERN.test(id) ? id : null;
}

/** Canonical relative href for a node markdown file in `content/data/`. */
export function canonicalNodeMarkdownHref(nodeId: string): string {
  return `./${nodeId}.md`;
}

/** Resolve a markdown href to a node id, if it references a graph node. */
export function resolveMarkdownHrefTarget(href: string): string | null {
  const trimmed = href.trim();
  if (!trimmed) return null;

  const fromUri = resolveNodeIdFromInternalUri(trimmed);
  if (fromUri) return fromUri;

  const fromScheme = resolveNodeIdFromInternalScheme(trimmed);
  if (fromScheme) return fromScheme;

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return resolveNodeIdFromUrl(trimmed);
  }

  if (trimmed.startsWith("#") || trimmed.startsWith("mailto:")) {
    return null;
  }

  const fromQuery = resolveNodeIdFromQueryOnlyHref(trimmed);
  if (fromQuery) return fromQuery;

  let decoded = trimmed;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    /* keep raw href */
  }

  const wikiMatch = WIKI_LINK.exec(decoded);
  if (wikiMatch?.[1]) return wikiMatch[1];

  const canonicalMatch = CANONICAL_MD_LINK.exec(decoded);
  if (canonicalMatch?.[1]) return canonicalMatch[1];

  return null;
}

/** Rewrite resolvable node links in markdown bodies to `./{nodeId}.md`. */
export function canonicalizeMarkdownBodyLinks(body: string): string {
  return body.replace(MD_LINK, (match, text: string, href: string) => {
    const targetId = resolveMarkdownHrefTarget(href);
    if (!targetId) return match;
    const canonical = canonicalNodeMarkdownHref(targetId);
    if (href.trim() === canonical) return match;
    return `[${text}](${canonical})`;
  });
}

/** Rewrite resolvable node links to host-specific navigable hrefs for the editor. */
export function expandMarkdownBodyLinks(
  body: string,
  hrefForNodeId: (nodeId: string) => string,
): string {
  return body.replace(MD_LINK, (match, text: string, href: string) => {
    if (hasDynamicLinkMarker(href)) return match;
    const targetId = resolveMarkdownHrefTarget(href);
    if (!targetId) return match;
    const display = hrefForNodeId(targetId);
    if (href.trim() === display) return match;
    return `[${text}](${display})`;
  });
}

export interface MarkdownLinkMatch {
  linkText: string;
}

/** Find inline markdown links in body text that resolve to targetId. */
export function findMarkdownLinksToTarget(
  body: string,
  targetId: string,
): MarkdownLinkMatch[] {
  const matches: MarkdownLinkMatch[] = [];

  MD_LINK.lastIndex = 0;
  let mdMatch: RegExpExecArray | null;
  while ((mdMatch = MD_LINK.exec(body)) !== null) {
    const linkText = mdMatch[1] ?? "";
    const href = mdMatch[2] ?? "";
    if (resolveMarkdownHrefTarget(href) === targetId) {
      matches.push({ linkText });
    }
  }

  PAREN_LINK.lastIndex = 0;
  let parenMatch: RegExpExecArray | null;
  while ((parenMatch = PAREN_LINK.exec(body)) !== null) {
    const linkText = parenMatch[1]?.trim() ?? "";
    const pathPart = parenMatch[2]?.trim() ?? "";
    if (resolveMarkdownHrefTarget(pathPart) === targetId) {
      matches.push({ linkText });
    }
  }

  const dynamicLink = new RegExp(`\\[\\[(${NODE_ID_RE_SRC})\\]\\]`, "g");
  let dynamicMatch: RegExpExecArray | null;
  while ((dynamicMatch = dynamicLink.exec(body)) !== null) {
    const id = dynamicMatch[1];
    if (id && id === targetId) {
      matches.push({ linkText: "" });
    }
  }

  return matches;
}
