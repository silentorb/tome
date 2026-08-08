import {
  canonicalNodeMarkdownHref,
  resolveMarkdownHrefTarget,
} from "tome-flatfile/markdown-links";
import {
  formatDynamicNodeLink,
} from "tome-flatfile/dynamic-node-links";
import { NODE_ID_RE_SRC } from "tome-flatfile/node-id";
import {
  parsePageBlockFences,
  serializePageBlock,
} from "tome-interfaces/page-block";
import type { NodeBodyDocument, NodeBodySegment } from "tome-graph-interfaces";
import type { GraphDatabase } from "tome-sqlite";

const DYNAMIC_LINK = new RegExp(`\\[\\[(${NODE_ID_RE_SRC})\\]\\]`);
const MD_LINK = /\[([^\]]*)\]\(([^)]+)\)/;
const LINK_TOKEN = new RegExp(
  `${DYNAMIC_LINK.source}|${MD_LINK.source}`,
  "g",
);
const CODE_FENCE = /(```[\s\S]*?```|~~~[\s\S]*?~~~)/g;

type UnresolvedSegment =
  | { type: "prose"; markdown: string }
  | { type: "dynamic_link"; nodeId: string }
  | { type: "static_link"; nodeId: string; label: string }
  | { type: "page_block"; componentId: string; data: unknown };

function pushProse(out: UnresolvedSegment[], markdown: string): void {
  if (markdown.length === 0) return;
  const last = out[out.length - 1];
  if (last?.type === "prose") {
    last.markdown += markdown;
  } else {
    out.push({ type: "prose", markdown });
  }
}

function tokenizeProseForLinks(segment: string, out: UnresolvedSegment[]): void {
  let cursor = 0;
  LINK_TOKEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = LINK_TOKEN.exec(segment)) !== null) {
    if (match.index > cursor) {
      pushProse(out, segment.slice(cursor, match.index));
    }
    const wikiId = match[1];
    if (wikiId) {
      out.push({ type: "dynamic_link", nodeId: wikiId });
    } else {
      const label = match[2] ?? "";
      const href = match[3] ?? "";
      const targetId = resolveMarkdownHrefTarget(href);
      if (targetId) {
        out.push({ type: "static_link", nodeId: targetId, label });
      } else {
        pushProse(out, match[0]!);
      }
    }
    cursor = match.index + match[0]!.length;
  }
  if (cursor < segment.length) {
    pushProse(out, segment.slice(cursor));
  }
}

/** Parse prose (keeping nested code fences as prose) into prose + link segments. */
function parseProseLinks(prose: string): UnresolvedSegment[] {
  const out: UnresolvedSegment[] = [];
  const parts = prose.split(CODE_FENCE);
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index] ?? "";
    const isFence = index % 2 === 1;
    if (isFence) {
      pushProse(out, part);
    } else {
      tokenizeProseForLinks(part, out);
    }
  }
  return out;
}

/** Decode storage markdown into a body document without page-block HTML (titles unresolved). */
export function parseStorageBodyToUnresolvedDocument(body: string): {
  segments: UnresolvedSegment[];
  dynamicLinkIds: string[];
} {
  const { segments: fenceSegments } = parsePageBlockFences(body);
  const segments: UnresolvedSegment[] = [];
  const dynamicLinkIds: string[] = [];

  for (const fence of fenceSegments) {
    if (fence.type === "block") {
      segments.push({
        type: "page_block",
        componentId: fence.payload.componentId,
        data: fence.payload.data,
      });
      continue;
    }
    for (const part of parseProseLinks(fence.content)) {
      segments.push(part);
      if (part.type === "dynamic_link") dynamicLinkIds.push(part.nodeId);
    }
  }

  return { segments, dynamicLinkIds: [...new Set(dynamicLinkIds)] };
}

export function titleMapForNodeIds(
  db: GraphDatabase,
  ids: readonly string[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const id of ids) {
    const node = db.getNode(id);
    const title =
      typeof node?.properties.title === "string" ? node.properties.title.trim() : "";
    map.set(id, title || "Untitled");
  }
  return map;
}

/** Storage markdown → structured document with resolved titles; page_block.editorHtml empty. */
export function storageBodyToDocument(
  db: GraphDatabase,
  body: string,
): NodeBodyDocument {
  const { segments: unresolved, dynamicLinkIds } = parseStorageBodyToUnresolvedDocument(body);
  const titles = titleMapForNodeIds(db, dynamicLinkIds);
  const segments: NodeBodySegment[] = unresolved.map((segment) => {
    switch (segment.type) {
      case "prose":
        return { type: "prose", markdown: segment.markdown };
      case "dynamic_link":
        return {
          type: "dynamic_link",
          nodeId: segment.nodeId,
          title: titles.get(segment.nodeId) ?? "Untitled",
        };
      case "static_link":
        return {
          type: "static_link",
          nodeId: segment.nodeId,
          label: segment.label,
        };
      case "page_block":
        return {
          type: "page_block",
          componentId: segment.componentId,
          data: segment.data,
          editorHtml: "",
        };
    }
  });
  return { segments };
}

/** Structured document → storage markdown. */
export function documentToStorageBody(document: NodeBodyDocument): string {
  return document.segments
    .map((segment) => {
      switch (segment.type) {
        case "prose":
          return segment.markdown;
        case "dynamic_link":
          return formatDynamicNodeLink(segment.nodeId);
        case "static_link":
          return `[${segment.label}](${canonicalNodeMarkdownHref(segment.nodeId)})`;
        case "page_block":
          return serializePageBlock(segment.componentId, segment.data);
      }
    })
    .join("");
}

export async function attachPageBlockEditorHtml(
  document: NodeBodyDocument,
  renderBlock: (componentId: string, data: unknown) => string | Promise<string>,
): Promise<NodeBodyDocument> {
  const segments: NodeBodySegment[] = [];
  for (const segment of document.segments) {
    if (segment.type !== "page_block") {
      segments.push(segment);
      continue;
    }
    const editorHtml = (await renderBlock(segment.componentId, segment.data)).trim();
    segments.push({ ...segment, editorHtml });
  }
  return { segments };
}
