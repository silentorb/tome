import { navigateStandaloneNode, openStandaloneNodeInNewTab, resolveNodePageTarget } from "./node-links";
import { isHardOpenLinkGesture } from "./standalone-navigation";
import { isNewTabLinkGesture, linkAnchorFromEventTarget } from "./editor-link-hard-open";

function openHrefInNewTab(href: string): void {
  const opener = document.createElement("a");
  opener.href = href;
  opener.target = "_blank";
  opener.rel = "noopener noreferrer";
  opener.click();
}

/** True when the anchor lives in a React page-block host, not Milkdown prose. */
function isPageBlockReactAnchor(anchor: Element): boolean {
  return anchor.closest('[data-type="tome-page-block-react"]') !== null;
}

/** Handle pointer activation on a node cross-link inside the Milkdown editor root. */
export function handleEditorLinkPointerEvent(
  event: MouseEvent,
  root: ParentNode,
  baseHref: string = window.location.href,
): boolean {
  if (event.defaultPrevented) return false;

  const anchor = linkAnchorFromEventTarget(event.target);
  if (!anchor || !root.contains(anchor)) return false;
  // Interactive page blocks own their anchors (popup, timeline bars, query tables).
  // Chrome soft-nav still handles unmodified clicks that bubble to document.
  if (isPageBlockReactAnchor(anchor)) return false;

  if (event.button === 2) return false;

  // ProseMirror claims Ctrl/Cmd+click for node selection, so emulate new-tab here.
  if (isNewTabLinkGesture(event)) {
    event.preventDefault();
    event.stopPropagation();
    const nodeId = resolveNodePageTarget(anchor.getAttribute("href") ?? "", baseHref);
    if (nodeId) {
      openStandaloneNodeInNewTab(nodeId, baseHref);
    } else {
      openHrefInNewTab(anchor.href);
    }
    return true;
  }

  // Shift / middle / alt: leave native anchor behavior.
  if (isHardOpenLinkGesture(event)) return false;

  const nodeId = resolveNodePageTarget(anchor.getAttribute("href") ?? "", baseHref);
  if (!nodeId) return false;

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
