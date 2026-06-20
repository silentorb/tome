import type { Node as ProseNode } from "@milkdown/prose/model";
import { Plugin, PluginKey } from "@milkdown/prose/state";
import { Decoration, DecorationSet, type EditorView } from "@milkdown/prose/view";
import { parsePageBlockPayload } from "tome-interfaces/page-block";

const pageBlockPluginKey = new PluginKey("tome-page-block-decoration");

function fencePayloadFromCodeBlock(text: string): string | null {
  const payload = parsePageBlockPayload(text);
  return payload?.componentId ?? null;
}

function buildPageBlockDecorations(doc: ProseNode): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "code_block") return;
    if (node.attrs.language !== "tome-block") return;
    const componentId = fencePayloadFromCodeBlock(node.textContent);
    decorations.push(
      Decoration.node(pos, pos + node.nodeSize, {
        class: "tome-page-block-fence",
        "data-component-id": componentId ?? "unknown",
      }),
    );
  });
  return DecorationSet.create(doc, decorations);
}

export function createPageBlockDecorationPlugin(): Plugin {
  return new Plugin({
    key: pageBlockPluginKey,
    state: {
      init: (_, { doc }) => buildPageBlockDecorations(doc),
      apply(tr, set) {
        if (tr.docChanged) return buildPageBlockDecorations(tr.doc);
        return set;
      },
    },
    props: {
      decorations(state) {
        return pageBlockPluginKey.getState(state);
      },
    },
  });
}

export function installPageBlockDecoration(view: EditorView): void {
  const plugin = createPageBlockDecorationPlugin();
  view.updateState(view.state.reconfigure({ plugins: [...view.state.plugins, plugin] }));
}
