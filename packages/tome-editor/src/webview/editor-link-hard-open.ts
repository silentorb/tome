import { Plugin, PluginKey } from "@milkdown/prose/state";
import type { EditorView } from "@milkdown/prose/view";

const linkHardOpenKey = new PluginKey("tome-link-hard-open");

/** Nearest navigable anchor from a pointer event target. */
export function linkAnchorFromEventTarget(target: EventTarget | null): HTMLAnchorElement | null {
  if (!(target instanceof Element)) return null;
  return target.closest("a[href]");
}

/** Ctrl/Cmd + primary click — ProseMirror's node-select modifier, which we reclaim for new-tab. */
export function isNewTabLinkGesture(event: MouseEvent | PointerEvent): boolean {
  return event.button === 0 && (event.ctrlKey || event.metaKey);
}

/**
 * Return true so ProseMirror's handleSingleClick skips selectClickedNode.
 * Actual navigation is handled by handleEditorLinkPointerEvent on the click event.
 */
export function handleLinkHardOpenClick(
  _view: EditorView | null,
  _pos: number,
  event: MouseEvent,
): boolean {
  if (!isNewTabLinkGesture(event)) return false;
  return linkAnchorFromEventTarget(event.target) !== null;
}

export function createLinkHardOpenPlugin(): Plugin {
  return new Plugin({
    key: linkHardOpenKey,
    props: {
      handleClick(view, pos, event) {
        return handleLinkHardOpenClick(view, pos, event);
      },
    },
  });
}

export function installLinkHardOpen(view: EditorView): void {
  const plugin = createLinkHardOpenPlugin();
  view.updateState(view.state.reconfigure({ plugins: [...view.state.plugins, plugin] }));
}
