import {
  chainCommands,
  deleteSelection,
  joinForward,
  selectNodeForward,
} from "@milkdown/prose/commands";
import { Plugin, PluginKey, TextSelection } from "@milkdown/prose/state";
import type { EditorState } from "@milkdown/prose/state";
import type { EditorView } from "@milkdown/prose/view";

const listItemDeleteKeymapKey = new PluginKey("tome-list-item-delete-keymap");

function selectionAtListItemTextStart(state: EditorState): boolean {
  const { selection } = state;
  if (!(selection instanceof TextSelection)) return false;

  const { empty, $from } = selection;
  if (!empty || $from.parentOffset !== 0) return false;

  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type.name === "list_item") return true;
  }
  return false;
}

function handleListItemDelete(view: EditorView): boolean {
  const { state, dispatch } = view;
  if (!selectionAtListItemTextStart(state)) return false;

  const handled = chainCommands(deleteSelection, joinForward, selectNodeForward)(
    state,
    dispatch,
    view,
  );
  if (handled) return true;

  const { $from } = state.selection as TextSelection;
  if ($from.parent.content.size > 0) {
    const tr = state.tr.delete($from.pos, $from.pos + 1);
    if (tr.docChanged) {
      dispatch(tr);
      return true;
    }
  }

  // Empty list item: block Milkdown's Delete → joinBackward mapping.
  return true;
}

export function createListItemDeleteKeymapPlugin(): Plugin {
  return new Plugin({
    key: listItemDeleteKeymapKey,
    view(view) {
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key !== "Delete") return;
        if (!handleListItemDelete(view)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
      };

      view.dom.addEventListener("keydown", onKeyDown, true);
      return {
        destroy() {
          view.dom.removeEventListener("keydown", onKeyDown, true);
        },
      };
    },
  });
}

export function installListItemDeleteKeymap(view: EditorView): void {
  const plugin = createListItemDeleteKeymapPlugin();
  view.updateState(view.state.reconfigure({ plugins: [...view.state.plugins, plugin] }));
}
