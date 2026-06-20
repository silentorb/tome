import { isDynamicEditorHref } from "tome-db/dynamic-node-links";
import { resolveMarkdownHrefTarget } from "tome-db/markdown-links";
import type { Node as ProseNode } from "@milkdown/prose/model";
import { Plugin, PluginKey } from "@milkdown/prose/state";
import { Decoration, DecorationSet, type EditorView } from "@milkdown/prose/view";
import { createNodeLinkIconElement } from "./node-link-icon";

export { isDynamicEditorHref } from "tome-db/dynamic-node-links";

export const dynamicTitleRefreshMetaKey = "tomeDynamicTitleRefresh";

export function transactionHasDynamicTitleRefresh(
  tr: { getMeta: (key: string) => unknown },
): boolean {
  return Boolean(tr.getMeta(dynamicTitleRefreshMetaKey));
}

function linkMarkHref(node: ProseNode): string | null {
  if (!node.isText) return null;
  const link = node.marks.find((mark) => mark.type.name === "link");
  const href = link?.attrs.href;
  return typeof href === "string" ? href : null;
}

function buildDynamicLinkDecorations(doc: ProseNode): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    const href = linkMarkHref(node);
    if (!href || !isDynamicEditorHref(href) || !resolveMarkdownHrefTarget(href)) return;
    decorations.push(
      Decoration.widget(
        pos,
        () => createNodeLinkIconElement(),
        { side: -1, key: `dynamic-link-icon-${pos}` },
      ),
      Decoration.inline(pos, pos + node.nodeSize, { class: "tome-dynamic-node-link" }),
    );
  });
  return DecorationSet.create(doc, decorations);
}

const dynamicLinkDecorationKey = new PluginKey("tome-dynamic-link-decoration");

export function createDynamicLinkDecorationPlugin(): Plugin {
  return new Plugin({
    key: dynamicLinkDecorationKey,
    state: {
      init: (_, { doc }) => buildDynamicLinkDecorations(doc),
      apply(tr, set) {
        if (tr.docChanged || transactionHasDynamicTitleRefresh(tr)) {
          return buildDynamicLinkDecorations(tr.doc);
        }
        return set.map(tr.mapping, tr.doc);
      },
    },
    props: {
      decorations(state) {
        return dynamicLinkDecorationKey.getState(state);
      },
    },
  });
}

export function installDynamicLinkDecoration(view: EditorView): void {
  const plugin = createDynamicLinkDecorationPlugin();
  view.updateState(view.state.reconfigure({ plugins: [...view.state.plugins, plugin] }));
}
