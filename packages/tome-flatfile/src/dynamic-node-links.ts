import {
  expandMarkdownBodyLinks,
  resolveMarkdownHrefTarget,
} from "./markdown-links";

import { NODE_ID_PATTERN, NODE_ID_RE_SRC } from "./node-id";

const DYNAMIC_NODE_LINK = new RegExp(`\\[\\[(${NODE_ID_RE_SRC})\\]\\]`, "g");
const MD_LINK = /\[([^\]]*)\]\(([^)]+)\)/g;
/** Crepe-projection query flag: link label is bound to the target node's title (`[[id]]` in storage). */
export const DYNAMIC_TITLE_EDITOR_QUERY_PARAM = "dynamicTitle";
export const DYNAMIC_TITLE_EDITOR_QUERY_VALUE = "1";

function unescapeMarkdownHref(href: string): string {
  return href.replace(/\\&/g, "&").replace(/&amp;/g, "&");
}

/** Accent/case-insensitive trimmed title comparison for migration. */
export function linkTextMatchesNodeTitle(linkText: string, nodeTitle: string): boolean {
  return (
    linkText.trim().localeCompare(nodeTitle.trim(), undefined, { sensitivity: "base" }) === 0
  );
}

/** Strip markdown emphasis markers before comparing link text to a node title. */
export function normalizeLinkTextForTitleMatch(linkText: string): string {
  return linkText.replace(/\*+/g, "").trim();
}

/** True when link text matches any of the node's display names (title, alias, …). */
export function linkTextMatchesAnyNodeName(
  linkText: string,
  names: readonly string[],
): boolean {
  if (names.length === 0) return false;
  const normalized = normalizeLinkTextForTitleMatch(linkText);
  return names.some((name) => linkTextMatchesNodeTitle(normalized, name));
}

/** Stored dynamic link: `[[{nodeId}]]`. */
export function formatDynamicNodeLink(nodeId: string): string {
  return `[[${nodeId}]]`;
}

/** Unique node ids referenced by `[[id]]` in body (outside code fences). */
export function parseDynamicNodeLinkIds(body: string): string[] {
  const ids = new Set<string>();
  transformOutsideCodeFences(body, (segment) => {
    DYNAMIC_NODE_LINK.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = DYNAMIC_NODE_LINK.exec(segment)) !== null) {
      const id = match[1];
      if (id) ids.add(id);
    }
    return segment;
  });
  return [...ids];
}

export function isDynamicEditorHref(href: string): boolean {
  const trimmed = unescapeMarkdownHref(href.trim());
  if (!trimmed.startsWith("?") && !trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    return false;
  }
  try {
    const url = trimmed.startsWith("?") ? new URL(trimmed, "http://local/") : new URL(trimmed);
    return url.searchParams.get(DYNAMIC_TITLE_EDITOR_QUERY_PARAM) === DYNAMIC_TITLE_EDITOR_QUERY_VALUE;
  } catch {
    return false;
  }
}

function stripDynamicQueryParam(href: string): string {
  const trimmed = unescapeMarkdownHref(href.trim());
  if (!isDynamicEditorHref(trimmed)) return href;
  try {
    const isQueryOnly = trimmed.startsWith("?");
    const url = isQueryOnly ? new URL(trimmed, "http://local/") : new URL(trimmed);
    url.searchParams.delete(DYNAMIC_TITLE_EDITOR_QUERY_PARAM);
    if (isQueryOnly) {
      const params = url.searchParams.toString();
      return params ? `?${params}` : "?";
    }
    return url.toString();
  } catch {
    return href;
  }
}

/** Crepe-projection href for a dynamic-title node link. */
export function editorDynamicNodeHref(nodeId: string): string {
  return `?node=${nodeId}&${DYNAMIC_TITLE_EDITOR_QUERY_PARAM}=${DYNAMIC_TITLE_EDITOR_QUERY_VALUE}`;
}

/** Expand `[[id]]` to titled markdown links (outside code fences). */
export function expandDynamicNodeLinks(
  body: string,
  titleForId: (nodeId: string) => string,
  hrefForId: (nodeId: string) => string,
): string {
  return transformOutsideCodeFences(body, (segment) =>
    segment.replace(DYNAMIC_NODE_LINK, (_match, id: string) => {
      const nodeId = id;
      const title = titleForId(nodeId);
      return `[${title}](${hrefForId(nodeId)})`;
    }),
  );
}

/** Expand `[[id]]` to editor display links with ephemeral dynamic-title marker. */
export function expandDynamicNodeLinksForEditor(
  body: string,
  titleForId: (nodeId: string) => string,
): string {
  return expandDynamicNodeLinks(body, titleForId, editorDynamicNodeHref);
}

/** Collapse editor dynamic-title links to `[[id]]`; strip dynamic flag from remaining node links. */
export function collapseDynamicEditorLinks(body: string): string {
  return transformOutsideCodeFences(body, (segment) =>
    segment.replace(MD_LINK, (match, text: string, href: string) => {
      const targetId = resolveMarkdownHrefTarget(href);
      if (!targetId) return match;
      if (isDynamicEditorHref(href)) {
        return formatDynamicNodeLink(targetId);
      }
      const stripped = stripDynamicQueryParam(href);
      if (stripped === href.trim()) return match;
      return `[${text}](${stripped})`;
    }),
  );
}

/** Replace static links whose text matches a target display name with `[[id]]`. */
export function migrateStaticLinksToDynamic(
  body: string,
  namesForId: (nodeId: string) => readonly string[],
): string {
  return transformOutsideCodeFences(body, (segment) =>
    segment.replace(MD_LINK, (match, text: string, href: string) => {
      const targetId = resolveMarkdownHrefTarget(href);
      if (!targetId) return match;
      const names = namesForId(targetId);
      if (!linkTextMatchesAnyNodeName(text, names)) return match;
      return formatDynamicNodeLink(targetId);
    }),
  );
}

export interface MigrateStaticLinksReport {
  filesChanged: number;
  filesUnchanged: number;
  linksConverted: number;
  linksSkippedCustomText: number;
}

/** Scan bodies and apply {@link migrateStaticLinksToDynamic}, returning conversion stats. */
export function migrateStaticLinksInBodies(
  bodies: Iterable<{ id: string; body: string }>,
  namesForId: (nodeId: string) => readonly string[],
): { bodies: Map<string, string>; report: MigrateStaticLinksReport } {
  const MD = /\[([^\]]*)\]\(([^)]+)\)/g;
  const result = new Map<string, string>();
  const report: MigrateStaticLinksReport = {
    filesChanged: 0,
    filesUnchanged: 0,
    linksConverted: 0,
    linksSkippedCustomText: 0,
  };

  for (const { id, body } of bodies) {
    const nextBody = migrateStaticLinksToDynamic(body, namesForId);
    result.set(id, nextBody);
    if (nextBody === body) {
      report.filesUnchanged++;
      continue;
    }
    report.filesChanged++;

    const beforeLinks: Array<{ text: string; targetId: string }> = [];
    transformOutsideCodeFences(body, (segment) => {
      MD.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = MD.exec(segment)) !== null) {
        const targetId = resolveMarkdownHrefTarget(match[2] ?? "");
        if (targetId) beforeLinks.push({ text: match[1] ?? "", targetId });
      }
      return segment;
    });

    const dynamicAfter = (nextBody.match(DYNAMIC_NODE_LINK) ?? []).length;
    const dynamicBefore = (body.match(DYNAMIC_NODE_LINK) ?? []).length;
    report.linksConverted += dynamicAfter - dynamicBefore;

    for (const link of beforeLinks) {
      const names = namesForId(link.targetId);
      if (!linkTextMatchesAnyNodeName(link.text, names)) {
        report.linksSkippedCustomText++;
      }
    }
  }

  return { bodies: result, report };
}

/** Split markdown into alternating prose/code segments; transform prose only. */
export function transformOutsideCodeFences(
  body: string,
  transform: (segment: string) => string,
): string {
  const fence = /(```[\s\S]*?```|~~~[\s\S]*?~~~)/g;
  const parts = body.split(fence);
  return parts
    .map((part, index) => {
      const isFence = index % 2 === 1;
      return isFence ? part : transform(part);
    })
    .join("");
}

/** Prepare editor markdown: static node href expansion then dynamic links. */
export function prepareEditorMarkdownBody(
  body: string,
  titleForId: (nodeId: string) => string,
  hrefForNodeId: (nodeId: string) => string,
): string {
  const withStatic = expandMarkdownBodyLinks(body, hrefForNodeId);
  return expandDynamicNodeLinksForEditor(withStatic, titleForId);
}

export function isValidNodeId(id: string): boolean {
  return NODE_ID_PATTERN.test(id);
}
