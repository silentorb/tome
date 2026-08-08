import {
  isNodeId,
  isStandaloneCreatePageUrl,
  navigateStandaloneNode,
  navigateStandaloneUrl,
  resolveNodePageTarget,
} from "./node-links";

/** True when a modifier or non-primary button should hard-open (leave to browser or emulate). */
export function isHardOpenLinkGesture(event: MouseEvent | PointerEvent): boolean {
  return (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  );
}

/** True when the URL is an in-app editor navigation target (node / create / explorer). */
export function isStandaloneAppNavigableUrl(url: URL, base?: string | URL): boolean {
  try {
    const baseUrl =
      base instanceof URL
        ? base
        : new URL(base ?? (typeof window !== "undefined" ? window.location.href : url.href));
    if (url.origin !== baseUrl.origin) return false;

    if (isStandaloneCreatePageUrl(url)) return true;

    const view = url.searchParams.get("view");
    if (view === "explorer" || view === "overview") return true;

    const nodeParam = url.searchParams.get("node");
    return nodeParam !== null && isNodeId(nodeParam);
  } catch {
    return false;
  }
}

/**
 * Soft-navigate unmodified primary clicks on in-app anchors.
 * Modified clicks / middle-click / right-click are left to the browser.
 */
export function handleStandaloneAnchorClick(
  event: MouseEvent,
  baseHref: string = typeof window !== "undefined" ? window.location.href : "http://127.0.0.1:5173/",
): boolean {
  if (event.defaultPrevented) return false;
  if (isHardOpenLinkGesture(event)) return false;

  const target = event.target as Element | null;
  const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
  if (!anchor) return false;
  if (anchor.target === "_blank" || anchor.hasAttribute("download")) return false;

  const hrefAttr = anchor.getAttribute("href") ?? "";
  if (!hrefAttr || hrefAttr.startsWith("#")) return false;

  let url: URL;
  try {
    url = new URL(hrefAttr, baseHref);
  } catch {
    return false;
  }

  if (isStandaloneAppNavigableUrl(url, baseHref)) {
    event.preventDefault();
    navigateStandaloneUrl(url.toString());
    return true;
  }

  const nodeId = resolveNodePageTarget(hrefAttr, baseHref);
  if (!nodeId) return false;

  event.preventDefault();
  navigateStandaloneNode(nodeId, baseHref);
  return true;
}

let detachChromeNavigation: (() => void) | null = null;

/** Detach any active chrome soft-nav listener (tests / remount safety). */
export function resetStandaloneChromeNavigation(): void {
  detachChromeNavigation?.();
  detachChromeNavigation = null;
}

/** Attach document-level soft navigation for app-chrome anchors (bubble phase). */
export function attachStandaloneChromeNavigation(
  root: ParentNode = typeof document !== "undefined" ? document : (undefined as unknown as ParentNode),
): () => void {
  if (typeof document === "undefined" || !root) return () => {};

  resetStandaloneChromeNavigation();

  const onClick = (event: Event) => {
    handleStandaloneAnchorClick(event as MouseEvent);
  };
  root.addEventListener("click", onClick);
  const detach = () => {
    root.removeEventListener("click", onClick);
    if (detachChromeNavigation === detach) detachChromeNavigation = null;
  };
  detachChromeNavigation = detach;
  return detach;
}
