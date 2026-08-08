import { navigateStandaloneNode, resolveNodePageTarget } from "./node-links";
import { isHardOpenLinkGesture } from "./standalone-navigation";

/** Handle pointer activation on a node cross-link inside the Milkdown editor root. */
export function handleEditorLinkPointerEvent(
  event: MouseEvent,
  root: ParentNode,
  baseHref: string = window.location.href,
): boolean {
  const target = event.target as HTMLElement | null;
  const anchor = target?.closest("a") as HTMLAnchorElement | null;
  if (!anchor || !root.contains(anchor)) return false;

  const nodeId = resolveNodePageTarget(anchor.getAttribute("href") ?? "", baseHref);
  if (!nodeId) return false;

  // Right-click / modified clicks / middle-click: leave native anchor behavior.
  if (event.button === 2 || isHardOpenLinkGesture(event)) return false;

  event.preventDefault();
  event.stopPropagation();
  navigateStandaloneNode(nodeId, baseHref);
  return true;
}

export function attachEditorLinkNavigation(root: HTMLElement): () => void {
  const onPointer = (event: MouseEvent) => {
    handleEditorLinkPointerEvent(event, root);
  };
  root.addEventListener("click", onPointer);
  root.addEventListener("auxclick", onPointer);
  return () => {
    root.removeEventListener("click", onPointer);
    root.removeEventListener("auxclick", onPointer);
  };
}
