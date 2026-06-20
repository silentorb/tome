/** Leading `# …` line in imported Notion bodies (page title duplicated in markdown). */
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
 * Resolve the page title and editor content from stored body + title property.
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

/** True when markdown adds nothing beyond the record title (e.g. imported `# Title` only). */
export function isEffectivelyEmptyMarkdown(body: string, title: string): boolean {
  const { content } = resolvePageTitleAndContent(body, title);
  return !content.trim();
}
