import type { PageBlockPayload } from "./types";
import {
  parsePageBlockFences,
  parsePageBlockPayload,
  serializePageBlock,
} from "./parse";

const EMBED_COMMENT_PREFIX = "<!-- tome-page-block ";
const EMBED_COMMENT_SUFFIX = " -->";

/** HTML comment storing canonical block payload for editor round-trip. */
export function formatPageBlockEmbedComment(payload: PageBlockPayload): string {
  return `${EMBED_COMMENT_PREFIX}${JSON.stringify(payload)}${EMBED_COMMENT_SUFFIX}`;
}

export async function expandPageBlockFencesForEditor(
  markdown: string,
  renderBlock: (payload: PageBlockPayload) => string | Promise<string>,
): Promise<string> {
  const { segments } = parsePageBlockFences(markdown);
  const parts: string[] = [];

  for (const segment of segments) {
    if (segment.type === "prose") {
      parts.push(segment.content);
      continue;
    }
    const html = (await renderBlock(segment.payload)).trim();
    parts.push(`${formatPageBlockEmbedComment(segment.payload)}\n${html}`);
  }

  return parts.join("");
}

const EMBED_COMMENT_RE = /<!-- tome-page-block (\{[\s\S]*?\}) -->/g;

function findPageBlockEmbedHtmlEnd(markdown: string, start: number): number {
  let index = start;
  while (index < markdown.length && /\s/.test(markdown[index]!)) {
    index += 1;
  }
  if (markdown[index] !== "<") return index;

  const tagMatch = /^<([a-zA-Z][\w-]*)/.exec(markdown.slice(index));
  if (!tagMatch) return index;

  const tag = tagMatch[1]!.toLowerCase();
  const closeTag = `</${tag}>`;
  const closeIndex = markdown.indexOf(closeTag, index);
  if (closeIndex < 0) return index;
  return closeIndex + closeTag.length;
}

/** Collapse server-rendered page block embeds back to ```tome-block fences. */
export function collapsePageBlockEmbedsForStorage(markdown: string): string {
  let result = "";
  let cursor = 0;
  EMBED_COMMENT_RE.lastIndex = 0;

  for (;;) {
    const match = EMBED_COMMENT_RE.exec(markdown);
    if (!match) break;

    result += markdown.slice(cursor, match.index);
    const payload = parsePageBlockPayload(match[1]!);
    const htmlEnd = findPageBlockEmbedHtmlEnd(markdown, match.index + match[0].length);

    if (payload) {
      result += serializePageBlock(payload.componentId, payload.data);
    } else {
      result += markdown.slice(match.index, htmlEnd);
    }
    cursor = htmlEnd;
  }

  result += markdown.slice(cursor);
  return result;
}
