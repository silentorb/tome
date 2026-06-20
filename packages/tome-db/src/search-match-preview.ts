export interface SearchMatchPreviewPart {
  text: string;
  highlight: boolean;
}

export interface SearchMatchPreview {
  parts: ReadonlyArray<SearchMatchPreviewPart>;
}

const TARGET_WINDOW = 130;

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ");
}

function findMatchIndex(haystack: string, needle: string): number {
  if (!needle) return -1;
  return haystack.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase());
}

/**
 * Build a short excerpt around the first case-insensitive body match for global search.
 */
export function buildSearchMatchPreview(
  body: string,
  query: string,
): SearchMatchPreview | null {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return null;

  const matchIndex = findMatchIndex(body, trimmedQuery);
  if (matchIndex < 0) return null;

  const matchLength = trimmedQuery.length;
  const remaining = Math.max(0, TARGET_WINDOW - matchLength);
  let beforeBudget = Math.floor(remaining / 2);
  let afterBudget = remaining - beforeBudget;

  let start = Math.max(0, matchIndex - beforeBudget);
  let end = Math.min(body.length, matchIndex + matchLength + afterBudget);

  const used = end - start;
  if (used < TARGET_WINDOW && body.length > used) {
    const extra = TARGET_WINDOW - used;
    if (start === 0) {
      end = Math.min(body.length, end + extra);
    } else if (end === body.length) {
      start = Math.max(0, start - extra);
    }
  }

  const prefixEllipsis = start > 0;
  const suffixEllipsis = end < body.length;

  let before = body.slice(start, matchIndex);
  const matchText = body.slice(matchIndex, matchIndex + matchLength);
  let after = body.slice(matchIndex + matchLength, end);

  before = collapseWhitespace(before);
  after = collapseWhitespace(after);
  const matchCollapsed = collapseWhitespace(matchText);

  const parts: SearchMatchPreviewPart[] = [];
  if (prefixEllipsis) {
    parts.push({ text: "…", highlight: false });
  }
  if (before) {
    parts.push({ text: before, highlight: false });
  }
  parts.push({ text: matchCollapsed, highlight: true });
  if (after) {
    parts.push({ text: after, highlight: false });
  }
  if (suffixEllipsis) {
    parts.push({ text: "…", highlight: false });
  }

  return { parts };
}
