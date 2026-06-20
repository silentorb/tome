import { resolveMarkdownHrefTarget } from "tome-db/markdown-links";
import { Plugin, PluginKey } from "@milkdown/prose/state";
import type { EditorView } from "@milkdown/prose/view";
import { isDynamicEditorHref, transactionHasDynamicTitleRefresh } from "./dynamic-node-link-decoration";
import { standaloneEditorNodeHref } from "./standalone-markdown";

const dynamicLinkDemoteKey = new PluginKey("tome-dynamic-link-demote");

function dynamicLinkTextAt(doc: import("@milkdown/prose/model").Node, pos: number): string | null {
  const node = doc.nodeAt(pos);
  if (!node?.isText) return null;
  const href = node.marks.find((mark) => mark.type.name === "link")?.attrs.href;
  if (typeof href !== "string" || !isDynamicEditorHref(href)) return null;
  return node.text ?? "";
}

export function createDynamicLinkDemotePlugin(): Plugin {
  return new Plugin({
    key: dynamicLinkDemoteKey,
    appendTransaction(transactions, oldState, newState) {
      if (!transactions.some((tr) => tr.docChanged)) return null;
      if (transactions.some((tr) => transactionHasDynamicTitleRefresh(tr))) return null;

      let tr = newState.tr;
      let changed = false;

      newState.doc.descendants((node, pos) => {
        if (!node.isText) return;
        const linkMark = node.marks.find((mark) => mark.type.name === "link");
        if (!linkMark) return;
        const href = linkMark.attrs.href;
        if (typeof href !== "string" || !isDynamicEditorHref(href)) return;

        const oldText = dynamicLinkTextAt(oldState.doc, pos);
        const newText = node.text ?? "";
        if (oldText === null || oldText === newText) return;

        const nodeId = resolveMarkdownHrefTarget(href);
        if (!nodeId) return;

        const demotedHref = standaloneEditorNodeHref(nodeId);
        const demotedMark = linkMark.type.create({ ...linkMark.attrs, href: demotedHref });
        tr = tr.removeMark(pos, pos + node.nodeSize, linkMark.type);
        tr = tr.addMark(pos, pos + node.nodeSize, demotedMark);
        changed = true;
      });

      return changed ? tr : null;
    },
  });
}

export function installDynamicLinkDemote(view: EditorView): void {
  const plugin = createDynamicLinkDemotePlugin();
  view.updateState(view.state.reconfigure({ plugins: [...view.state.plugins, plugin] }));
}
