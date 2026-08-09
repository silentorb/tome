import { canonicalNodeMarkdownHref } from "tome-flatfile/markdown-links";
import { formatDynamicNodeLink } from "tome-flatfile/dynamic-node-links";
import { serializePageBlock } from "tome-interfaces/page-block";
import type { NodeBodyDocument } from "tome-graph-interfaces";

/** Structured document → storage markdown. Browser-safe (no SQLite). */
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
