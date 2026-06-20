import type { MarkdownSegment, PageBlockPayload, ParsedPageBlockMarkdown } from "./types";

const FENCE_OPEN = /^```tome-block\s*\n/;
const FENCE_CLOSE = /\n```/;

export function parsePageBlockPayload(raw: string): PageBlockPayload | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.componentId !== "string" || !obj.componentId.trim()) return null;
    return {
      componentId: obj.componentId.trim(),
      data: obj.data ?? {},
    };
  } catch {
    return null;
  }
}

export function serializePageBlock(componentId: string, data: unknown = {}): string {
  const payload: PageBlockPayload = { componentId, data };
  return ["```tome-block", JSON.stringify(payload, null, 2), "```"].join("\n");
}

export function parsePageBlockFences(markdown: string): ParsedPageBlockMarkdown {
  const segments: MarkdownSegment[] = [];
  let cursor = 0;

  while (cursor < markdown.length) {
    const rest = markdown.slice(cursor);
    const openMatch = rest.match(FENCE_OPEN);
    if (!openMatch || openMatch.index !== 0) {
      const nextOpen = rest.indexOf("```tome-block");
      if (nextOpen < 0) {
        if (rest.length > 0) {
          segments.push({ type: "prose", content: rest });
        }
        break;
      }
      if (nextOpen > 0) {
        segments.push({ type: "prose", content: rest.slice(0, nextOpen) });
      }
      cursor += nextOpen;
      continue;
    }

    const afterOpen = openMatch[0]!.length;
    const closeMatch = FENCE_CLOSE.exec(rest.slice(afterOpen));
    if (!closeMatch) {
      segments.push({ type: "prose", content: rest });
      break;
    }

    const inner = rest.slice(afterOpen, afterOpen + closeMatch.index!);
    const rawFence = rest.slice(0, afterOpen + closeMatch.index! + closeMatch[0]!.length);
    const payload = parsePageBlockPayload(inner);
    if (payload) {
      segments.push({ type: "block", payload, raw: rawFence });
    } else {
      segments.push({ type: "prose", content: rawFence });
    }
    cursor += rawFence.length;
  }

  return { segments };
}

/** Replace block segments with placeholders for marked, then substitute HTML. */
export function replacePageBlockFencesWithPlaceholders(markdown: string): {
  markdown: string;
  blocks: PageBlockPayload[];
} {
  const { segments } = parsePageBlockFences(markdown);
  const blocks: PageBlockPayload[] = [];
  const parts: string[] = [];

  for (const segment of segments) {
    if (segment.type === "prose") {
      parts.push(segment.content);
      continue;
    }
    const index = blocks.length;
    blocks.push(segment.payload);
    parts.push(`\n\n<!-- tome-page-block:${index} -->\n\n`);
  }

  return { markdown: parts.join(""), blocks };
}

export function substitutePageBlockPlaceholders(
  html: string,
  fragments: string[],
): string {
  let result = html;
  for (let index = 0; index < fragments.length; index += 1) {
    const placeholder = `<!-- tome-page-block:${index} -->`;
    result = result.replace(placeholder, fragments[index] ?? "");
  }
  return result;
}
