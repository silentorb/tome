import { Plugin, PluginKey } from "@milkdown/prose/state";
import type { EditorView } from "@milkdown/prose/view";

const linkCursorKey = new PluginKey("tome-link-cursor");

/** Milkdown's link mark defaults to inclusive; typing after a link then extends it. */
export function configureLinkMarkNonInclusive(view: EditorView): void {
  const link = view.state.schema.marks.link;
  if (!link) return;
  link.spec.inclusive = false;
}

export function createLinkCursorPlugin(): Plugin {
  return new Plugin({
    key: linkCursorKey,
    view(view: EditorView) {
      configureLinkMarkNonInclusive(view);
      return {};
    },
  });
}

export function installLinkCursor(view: EditorView): void {
  configureLinkMarkNonInclusive(view);
  const plugin = createLinkCursorPlugin();
  view.updateState(view.state.reconfigure({ plugins: [...view.state.plugins, plugin] }));
}
