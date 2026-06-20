import { Plugin, PluginKey } from "@milkdown/prose/state";
import type { EditorView } from "@milkdown/prose/view";

const mentionSyncKey = new PluginKey("tome-mention-sync");

export function createMentionSyncPlugin(sync: () => void): Plugin {
  return new Plugin({
    key: mentionSyncKey,
    view() {
      return {
        update(view, prevState) {
          const docChanged = view.state.doc !== prevState.doc;
          const selectionChanged = !view.state.selection.eq(prevState.selection);
          if (docChanged || selectionChanged) {
            queueMicrotask(sync);
          }
        },
      };
    },
  });
}

export function installMentionSync(view: EditorView, sync: () => void): void {
  const plugin = createMentionSyncPlugin(sync);
  view.updateState(view.state.reconfigure({ plugins: [...view.state.plugins, plugin] }));
}
