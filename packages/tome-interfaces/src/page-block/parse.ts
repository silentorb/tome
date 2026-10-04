import type { MarkdownSegment, PageBlockPayload, ParsedPageBlockMarkdown } from "./types";

export const PAGE_BLOCK_CONTENT_TYPE_JSON = "json";

const FENCE_CLOSE = /\n```/;
/** New format: ```json {type="role"} */
const JSON_FENCE_OPEN = /^```json\s+(\{[\s\S]*?\})\s*\n/;
/** Legacy format: ```tome-block */
const LEGACY_FENCE_OPEN = /^```tome-block\s*\n/;
const TYPE_ATTR_RE = /\btype\s*=\s*"([^"]+)"/;
const KIND_SUFFIX_RE = /\.(block|searcher)$/;

/** Strip trailing `.block` / `.searcher` from legacy component ids used as block types. */
export function normalizeLegacyBlockType(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  return trimmed.replace(KIND_SUFFIX_RE, "");
}

function payloadFromRole(blockType: string, data: unknown = {}, contentType = PAGE_BLOCK_CONTENT_TYPE_JSON): PageBlockPayload {
  return {
    blockType: blockType.trim(),
    contentType,
    data: data ?? {},
  };
}

/**
 * Parse embed-comment JSON or legacy nested `{componentId,data}` / new `{blockType,contentType?,data}`.
 * For fence bodies use {@link parsePageBlockFenceBody} instead.
 */
export function parsePageBlockPayload(raw: string): PageBlockPayload | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const obj = parsed as Record<string, unknown>;

    if (typeof obj.blockType === "string" && obj.blockType.trim()) {
      const contentType =
        typeof obj.contentType === "string" && obj.contentType.trim()
          ? obj.contentType.trim()
          : PAGE_BLOCK_CONTENT_TYPE_JSON;
      return payloadFromRole(obj.blockType, obj.data ?? {}, contentType);
    }

    // Legacy nested fence / old embed comment
    if (typeof obj.componentId === "string" && obj.componentId.trim()) {
      return payloadFromRole(normalizeLegacyBlockType(obj.componentId), obj.data ?? {});
    }

    return null;
  } catch {
    return null;
  }
}

/** Parse the JSON body of a ```json {type="…"} fence (flattened data object). */
export function parsePageBlockFenceBody(blockType: string, raw: string, contentType = PAGE_BLOCK_CONTENT_TYPE_JSON): PageBlockPayload | null {
  const role = blockType.trim();
  if (!role) return null;
  const trimmed = raw.trim();
  if (!trimmed) {
    return payloadFromRole(role, {}, contentType);
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return payloadFromRole(role, parsed, contentType);
  } catch {
    return null;
  }
}

export function parsePageBlockInfoMeta(meta: string): string | null {
  const match = TYPE_ATTR_RE.exec(meta);
  if (!match?.[1]?.trim()) return null;
  return match[1].trim();
}

/** Pretty-printed flattened data JSON for the fence body. */
export function serializePageBlockInner(_blockType: string, data: unknown = {}): string {
  return JSON.stringify(data ?? {}, null, 2);
}

export function formatPageBlockFenceMeta(blockType: string): string {
  return `{type="${blockType.trim()}"}`;
}

export function serializePageBlock(blockType: string, data: unknown = {}): string {
  const role = blockType.trim();
  const open = `\`\`\`${PAGE_BLOCK_CONTENT_TYPE_JSON} ${formatPageBlockFenceMeta(role)}`;
  return [open, serializePageBlockInner(role, data), "```"].join("\n");
}

function findNextFenceOpen(rest: string): { index: number; kind: "json" | "legacy" } | null {
  const jsonIdx = rest.search(/```json\b/);
  const legacyIdx = rest.indexOf("```tome-block");
  if (jsonIdx < 0 && legacyIdx < 0) return null;
  if (jsonIdx < 0) return { index: legacyIdx, kind: "legacy" };
  if (legacyIdx < 0) return { index: jsonIdx, kind: "json" };
  return jsonIdx <= legacyIdx
    ? { index: jsonIdx, kind: "json" }
    : { index: legacyIdx, kind: "legacy" };
}

export function parsePageBlockFences(markdown: string): ParsedPageBlockMarkdown {
  const segments: MarkdownSegment[] = [];
  let cursor = 0;

  while (cursor < markdown.length) {
    const rest = markdown.slice(cursor);

    const jsonOpen = rest.match(JSON_FENCE_OPEN);
    if (jsonOpen && jsonOpen.index === 0) {
      const meta = jsonOpen[1]!;
      const blockType = parsePageBlockInfoMeta(meta);
      const afterOpen = jsonOpen[0]!.length;
      const closeMatch = FENCE_CLOSE.exec(rest.slice(afterOpen));
      if (!closeMatch || !blockType) {
        // Not a page block (ordinary json fence or unclosed) — treat remainder scan carefully
        if (!blockType) {
          const next = findNextFenceOpen(rest.slice(3)); // skip past ```
          if (!next) {
            segments.push({ type: "prose", content: rest });
            break;
          }
          const skipTo = 3 + next.index;
          segments.push({ type: "prose", content: rest.slice(0, skipTo) });
          cursor += skipTo;
          continue;
        }
        segments.push({ type: "prose", content: rest });
        break;
      }
      const inner = rest.slice(afterOpen, afterOpen + closeMatch.index!);
      const rawFence = rest.slice(0, afterOpen + closeMatch.index! + closeMatch[0]!.length);
      const payload = parsePageBlockFenceBody(blockType, inner);
      if (payload) {
        segments.push({ type: "block", payload, raw: rawFence });
      } else {
        segments.push({ type: "prose", content: rawFence });
      }
      cursor += rawFence.length;
      continue;
    }

    const legacyOpen = rest.match(LEGACY_FENCE_OPEN);
    if (legacyOpen && legacyOpen.index === 0) {
      const afterOpen = legacyOpen[0]!.length;
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
      continue;
    }

    const next = findNextFenceOpen(rest);
    if (!next) {
      if (rest.length > 0) {
        segments.push({ type: "prose", content: rest });
      }
      break;
    }
    if (next.index > 0) {
      segments.push({ type: "prose", content: rest.slice(0, next.index) });
    }
    cursor += next.index;
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
