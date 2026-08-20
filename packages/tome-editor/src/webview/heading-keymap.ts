import type { EditorView } from "@milkdown/prose/view";

export function isHeadingLevelShortcut(event: KeyboardEvent): number | null {
  if (!(event.ctrlKey || event.metaKey)) return null;
  if (event.shiftKey || event.altKey) return null;
  if (!/^[1-6]$/.test(event.key)) return null;
  return Number(event.key);
}

export function installHeadingKeymap(
  view: EditorView,
  applyHeading: (level: number) => void,
): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    const level = isHeadingLevelShortcut(event);
    if (level == null) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    applyHeading(level);
  };

  view.dom.addEventListener("keydown", onKeyDown, true);
  return () => {
    view.dom.removeEventListener("keydown", onKeyDown, true);
  };
}
