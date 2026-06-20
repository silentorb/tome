import { Plugin } from "@milkdown/prose/state";
import type { EditorView } from "@milkdown/prose/view";
import { selectionInsideCallout } from "./callout-nesting";

/** Use the native caret inside callouts; virtual cursor breaks with hanging-indent layout. */
export function createCalloutCursorPlugin(): Plugin {
  return new Plugin({
    view(view: EditorView) {
      const sync = () => {
        view.dom.classList.toggle("tome-callout-editing", selectionInsideCallout(view.state, view));
      };
      sync();
      return {
        update() {
          sync();
        },
      };
    },
  });
}

export function installCalloutCursor(view: EditorView): void {
  const plugin = createCalloutCursorPlugin();
  view.updateState(view.state.reconfigure({ plugins: [...view.state.plugins, plugin] }));
}
