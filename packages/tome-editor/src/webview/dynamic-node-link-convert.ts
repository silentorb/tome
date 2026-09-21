import { editorDynamicNodeHref, isDynamicEditorHref } from "tome-flatfile/dynamic-node-links";
import { resolveMarkdownHrefTarget } from "tome-flatfile/markdown-links";
import type { EditorView } from "@milkdown/prose/view";
import { dynamicTitleRefreshMetaKey } from "./dynamic-node-link-decoration";

/**
 * Convert a static-titled node link mark to a dynamic-title link:
 * replace the label with `title` and set `?node={id}&dynamicTitle=1`.
 * Returns false when the range is not a static node link.
 */
export function convertStaticNodeLinkToDynamic(
  view: EditorView,
  from: number,
  to: number,
  title: string,
): boolean {
  if (from < 0 || to <= from || to > view.state.doc.content.size) return false;

  const linkType = view.state.schema.marks.link;
  if (!linkType) return false;

  let href: string | null = null;
  view.state.doc.nodesBetween(from, to, (node) => {
    if (href != null || !node.isText) return;
    const mark = node.marks.find((m) => m.type === linkType);
    if (mark && typeof mark.attrs.href === "string") href = mark.attrs.href;
  });
  if (!href || isDynamicEditorHref(href)) return false;

  const nodeId = resolveMarkdownHrefTarget(href);
  if (!nodeId) return false;

  const displayTitle = title.trim() || "Untitled";
  const dynamicHref = editorDynamicNodeHref(nodeId);
  const linkMark = linkType.create({ href: dynamicHref, title: null });
  const textNode = view.state.schema.text(displayTitle, [linkMark]);

  let tr = view.state.tr.replaceWith(from, to, textNode);
  tr = tr.setMeta(dynamicTitleRefreshMetaKey, true);
  view.dispatch(tr);
  return true;
}
