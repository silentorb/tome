import type { NodeBodyDocument, NodeBodySegment } from "tome-graph-interfaces";
import {
  editorDynamicNodeHref,
  isDynamicEditorHref,
} from "tome-flatfile/dynamic-node-links";
import { resolveMarkdownHrefTarget } from "tome-flatfile/markdown-links";
import {
  formatPageBlockEmbedComment,
  parsePageBlockPayload,
} from "tome-interfaces/page-block";

const MD_LINK = /\[([^\]]*)\]\(([^)]+)\)/g;
const EMBED_COMMENT_RE = /<!-- tome-page-block (\{[\s\S]*?\}) -->/g;
const CODE_FENCE = /(```[\s\S]*?```|~~~[\s\S]*?~~~)/g;

function standaloneEditorNodeHref(nodeId: string): string {
  return `?node=${nodeId}`;
}

function pushProse(out: NodeBodySegment[], markdown: string): void {
  if (markdown.length === 0) return;
  const last = out[out.length - 1];
  if (last?.type === "prose") {
    last.markdown += markdown;
  } else {
    out.push({ type: "prose", markdown });
  }
}

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

function tokenizeEditorProse(segment: string, out: NodeBodySegment[]): void {
  let cursor = 0;
  MD_LINK.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MD_LINK.exec(segment)) !== null) {
    if (match.index > cursor) {
      pushProse(out, segment.slice(cursor, match.index));
    }
    const label = match[1] ?? "";
    const href = match[2] ?? "";
    const targetId = resolveMarkdownHrefTarget(href);
    if (targetId) {
      if (isDynamicEditorHref(href)) {
        out.push({ type: "dynamic_link", nodeId: targetId, title: label });
      } else {
        out.push({ type: "static_link", nodeId: targetId, label });
      }
    } else {
      pushProse(out, match[0]!);
    }
    cursor = match.index + match[0]!.length;
  }
  if (cursor < segment.length) {
    pushProse(out, segment.slice(cursor));
  }
}

function parseEditorProse(prose: string, out: NodeBodySegment[]): void {
  const parts = prose.split(CODE_FENCE);
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index] ?? "";
    if (index % 2 === 1) {
      pushProse(out, part);
    } else {
      tokenizeEditorProse(part, out);
    }
  }
}

/** Crepe markdown projection → structured document (no server round-trip). */
export function editorMarkdownToDocument(markdown: string): NodeBodyDocument {
  const segments: NodeBodySegment[] = [];
  let cursor = 0;
  EMBED_COMMENT_RE.lastIndex = 0;

  for (;;) {
    const match = EMBED_COMMENT_RE.exec(markdown);
    if (!match) break;

    if (match.index > cursor) {
      parseEditorProse(markdown.slice(cursor, match.index), segments);
    }
    const payload = parsePageBlockPayload(match[1]!);
    const htmlEnd = findPageBlockEmbedHtmlEnd(markdown, match.index + match[0]!.length);
    const editorHtml = markdown.slice(match.index, htmlEnd).trim();
    if (payload) {
      segments.push({
        type: "page_block",
        componentId: payload.componentId,
        data: payload.data,
        editorHtml,
      });
    } else {
      pushProse(segments, markdown.slice(match.index, htmlEnd));
    }
    cursor = htmlEnd;
  }

  if (cursor < markdown.length) {
    parseEditorProse(markdown.slice(cursor), segments);
  }

  if (segments.length === 0) {
    return { segments: [{ type: "prose", markdown: "" }] };
  }
  return { segments };
}

/** Structured document → Crepe defaultValue markdown. */
export function documentToEditorMarkdown(document: NodeBodyDocument): string {
  return document.segments
    .map((segment) => {
      switch (segment.type) {
        case "prose":
          return segment.markdown;
        case "dynamic_link":
          return `[${segment.title}](${editorDynamicNodeHref(segment.nodeId)})`;
        case "static_link":
          return `[${segment.label}](${standaloneEditorNodeHref(segment.nodeId)})`;
        case "page_block":
          if (segment.editorHtml.trim()) return segment.editorHtml;
          return `${formatPageBlockEmbedComment({
            componentId: segment.componentId,
            data: segment.data,
          })}\n`;
      }
    })
    .join("");
}

export function documentsEqual(a: NodeBodyDocument, b: NodeBodyDocument): boolean {
  return JSON.stringify(a.segments) === JSON.stringify(b.segments);
}

/** True when the document has no meaningful prose/links/blocks for empty-state UI. */
export function isDocumentEffectivelyEmpty(document: NodeBodyDocument): boolean {
  const md = documentToEditorMarkdown(document).replace(/\s+/g, "");
  return md.length === 0;
}

/** Extract a leading page icon emoji from document prose, if any. */
export function extractPageIconFromDocument(document: NodeBodyDocument): string | null {
  for (const segment of document.segments) {
    if (segment.type !== "prose") continue;
    const trimmed = segment.markdown.trimStart();
    if (!trimmed) continue;
    const match = /^(\p{Extended_Pictographic})\s*/u.exec(trimmed);
    return match?.[1] ?? null;
  }
  return null;
}
