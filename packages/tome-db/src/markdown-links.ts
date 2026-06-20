export const TOME_LINK_SCHEME = "tome:";

const TOME_NODE_URI = /^tome:\/\/node\/([a-f0-9]{32})$/i;
const WIKI_LINK = /^\[\[([a-f0-9]{32})\]\]$/i;
const LEGACY_EXPORT_PATH = /([a-f0-9]{32})(?:\.(?:md|csv))?$/i;
const warnedLegacyHrefs = new Set<string>();

function warnLegacyHrefResolution(href: string): void {
  if (warnedLegacyHrefs.has(href)) return;
  warnedLegacyHrefs.add(href);
  console.warn(
    `[markdown-links] legacy export-style href resolved; prefer ./{nodeId}.md or [[{nodeId}]]: ${href}`,
  );
}
const NODE_ID_PATTERN = /^[a-f0-9]{32}$/i;
const MD_LINK = /\[([^\]]*)\]\(([^)]+)\)/g;
const NOTION_PAREN_LINK =
  /(?<!\[)([^\[\]\n(]+?)\s*\(\s*([^)]+?\.(?:md|csv))(?:#([^)]*))?\s*\)(?!\])/gi;

function hasDynamicLinkMarker(href: string): boolean {
  const trimmed = href.replace(/\\&/g, "&").replace(/&amp;/g, "&").trim();
  if (!trimmed.startsWith("?") && !trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    return false;
  }
  try {
    const url = trimmed.startsWith("?") ? new URL(trimmed, "http://local/") : new URL(trimmed);
    if (NODE_ID_PATTERN.test(url.searchParams.get("dynnode") ?? "")) return true;
    return url.searchParams.get("dynamic") === "1";
  } catch {
    return false;
  }
}

function normalizeRecordId(id: string): string {
  return id.toLowerCase();
}

function nodeIdFromQueryParam(value: string | null): string | null {
  if (!value || !NODE_ID_PATTERN.test(value)) return null;
  return normalizeRecordId(value);
}

function resolveNodeIdFromUrl(href: string): string | null {
  try {
    const url = new URL(href.replace(/\\&/g, "&"));
    return (
      nodeIdFromQueryParam(url.searchParams.get("node")) ??
      nodeIdFromQueryParam(url.searchParams.get("record")) ??
      nodeIdFromQueryParam(url.searchParams.get("dynnode"))
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
    nodeIdFromQueryParam(params.get("record")) ??
    nodeIdFromQueryParam(params.get("dynnode"))
  );
}

function resolveNodeIdFromInternalUri(trimmed: string): string | null {
  const match = TOME_NODE_URI.exec(trimmed);
  if (match?.[1]) return normalizeRecordId(match[1]);
  return null;
}

function resolveNodeIdFromInternalScheme(trimmed: string): string | null {
  if (!trimmed.startsWith(TOME_LINK_SCHEME)) return null;
  const id = trimmed.slice(TOME_LINK_SCHEME.length).trim();
  return id && NODE_ID_PATTERN.test(id) ? normalizeRecordId(id) : null;
}

/** Canonical relative href for a node markdown file in `content/data/`. */
export function canonicalNodeMarkdownHref(nodeId: string): string {
  return `./${normalizeRecordId(nodeId)}.md`;
}

/** Resolve a markdown href to a 32-hex record id, if it references a graph node. */
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
  if (wikiMatch?.[1]) return normalizeRecordId(wikiMatch[1]);

  const canonicalMatch = /^\.\/([a-f0-9]{32})\.md$/i.exec(decoded);
  if (canonicalMatch?.[1]) return normalizeRecordId(canonicalMatch[1]);

  const hashIdx = decoded.indexOf("#");
  const pathOnly = hashIdx >= 0 ? decoded.slice(0, hashIdx) : decoded;
  const legacyMatch = LEGACY_EXPORT_PATH.exec(pathOnly.trim());
  if (legacyMatch?.[1]) {
    warnLegacyHrefResolution(trimmed);
    return normalizeRecordId(legacyMatch[1]);
  }
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
  const normalizedTarget = normalizeRecordId(targetId);
  const matches: MarkdownLinkMatch[] = [];

  MD_LINK.lastIndex = 0;
  let mdMatch: RegExpExecArray | null;
  while ((mdMatch = MD_LINK.exec(body)) !== null) {
    const linkText = mdMatch[1] ?? "";
    const href = mdMatch[2] ?? "";
    if (resolveMarkdownHrefTarget(href) === normalizedTarget) {
      matches.push({ linkText });
    }
  }

  NOTION_PAREN_LINK.lastIndex = 0;
  let parenMatch: RegExpExecArray | null;
  while ((parenMatch = NOTION_PAREN_LINK.exec(body)) !== null) {
    const linkText = parenMatch[1]?.trim() ?? "";
    const pathPart = parenMatch[2]?.trim() ?? "";
    if (resolveMarkdownHrefTarget(pathPart) === normalizedTarget) {
      matches.push({ linkText });
    }
  }

  const DYNAMIC_NODE_LINK = /\[\[([a-f0-9]{32})\]\]/gi;
  DYNAMIC_NODE_LINK.lastIndex = 0;
  let dynamicMatch: RegExpExecArray | null;
  while ((dynamicMatch = DYNAMIC_NODE_LINK.exec(body)) !== null) {
    const id = dynamicMatch[1];
    if (id && normalizeRecordId(id) === normalizedTarget) {
      matches.push({ linkText: "" });
    }
  }

  return matches;
}
