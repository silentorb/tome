import type { AppView } from "../shared/types";

export const HOME_ICON = "⌂";

export const VIEW_ICONS: Record<Exclude<AppView, "node-page">, string> = {
  "graph-explorer": "⊕",
};

/** Suppress anchor navigation when dnd-kit emits a synthetic click after reorder. */
export function suppressNavigationClickAfterDragReorder(
  event: Pick<MouseEvent, "preventDefault">,
  dragCompleted: { current: boolean },
): void {
  if (!dragCompleted.current) return;
  event.preventDefault();
  dragCompleted.current = false;
}
