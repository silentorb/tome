import { describe, expect, test, afterEach, beforeEach } from "bun:test";
import type { WorkspaceQuickLink } from "tome-graph-interfaces";
import {
  buildQuickLinkIconMaps,
  navigateQuickLinkKeyboard,
  navigateQuickLinkPointerUp,
} from "../../src/webview/quick-links-nav";
import { setStandaloneNavigationHandler } from "../../src/webview/node-links";

const testQuickLinks: readonly WorkspaceQuickLink[] = [
  { nodeId: "0000000000000000000000002P", label: "Features", icon: "★" },
  { nodeId: "0000000000000000000000000T", label: "Solutions", icon: "✓" },
  { nodeId: "0000000000000000000000000D", label: "Scenes", icon: "▶" },
  { nodeId: "0000000000000000000000000K", label: "Inspirations", icon: "✦" },
  { nodeId: "0000000000000000000000000X", label: "Articles", icon: "§" },
  { nodeId: "00000000000000000000000035", label: "Characters", icon: "◎" },
  { nodeId: "0000000000000000000000002T", label: "Locations", icon: "⌖" },
];

describe("quick-links-nav", () => {
  test("buildQuickLinkIconMaps uses distinct node ids and labels", () => {
    const { byNodeId, byLabel } = buildQuickLinkIconMaps(testQuickLinks);
    const ids = testQuickLinks.map((link) => link.nodeId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.keys(byLabel)).toEqual([
      "Features",
      "Solutions",
      "Scenes",
      "Inspirations",
      "Articles",
      "Characters",
      "Locations",
    ]);
    expect(byNodeId["0000000000000000000000000D"]).toBe("▶");
  });

  test("Inspirations links to the database, not the parent page", () => {
    const inspirations = testQuickLinks.find((link) => link.label === "Inspirations");
    expect(inspirations?.nodeId).toBe("0000000000000000000000000K");
    expect(inspirations?.nodeId).not.toBe("00000000000000000000000034");
  });

  test("returns empty maps for missing links", () => {
    expect(buildQuickLinkIconMaps([])).toEqual({ byNodeId: {}, byLabel: {} });
  });
});

const NODE_ID = "0000000000000000000000002X";
const BASE = "http://127.0.0.1:5173/?node=AAAAAAAAAAAAAAAAAAAAAAAAAA";

describe("navigateQuickLinkPointerUp", () => {
  let originalAssign: typeof window.location.assign;
  let originalCreateElement: typeof document.createElement;
  let originalOpen: typeof window.open;
  let assignedUrl: string | null = null;
  let newTabHref: string | null = null;
  let openedUrl: string | null = null;
  let softNavCalls = 0;

  beforeEach(() => {
    originalAssign = window.location.assign.bind(window.location);
    originalCreateElement = document.createElement.bind(document);
    originalOpen = window.open.bind(window);
    assignedUrl = null;
    newTabHref = null;
    openedUrl = null;
    softNavCalls = 0;
    setStandaloneNavigationHandler(null);

    window.location.assign = ((url: string | URL) => {
      assignedUrl = String(url);
    }) as typeof window.location.assign;

    window.open = ((url?: string | URL) => {
      openedUrl = url != null ? String(url) : null;
      return null;
    }) as typeof window.open;

    document.createElement = ((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === "a") {
        el.click = () => {
          newTabHref = (el as HTMLAnchorElement).href;
        };
      }
      return el;
    }) as typeof document.createElement;
  });

  afterEach(() => {
    window.location.assign = originalAssign;
    window.open = originalOpen;
    document.createElement = originalCreateElement;
    setStandaloneNavigationHandler(null);
  });

  test("pointerup navigates when drag did not activate", () => {
    const dragState = { didDrag: false };
    const event = new PointerEvent("pointerup", { bubbles: true, cancelable: true, button: 0 });

    const navigated = navigateQuickLinkPointerUp(event, NODE_ID, BASE, dragState);
    expect(navigated).toBe(true);
    expect(assignedUrl).toContain(`node=${NODE_ID}`);
    expect(dragState.didDrag).toBe(false);
  });

  test("pointerup soft-navigates when handler is registered", () => {
    setStandaloneNavigationHandler(() => {
      softNavCalls += 1;
    });
    window.history.replaceState({}, "", BASE);
    const dragState = { didDrag: false };
    const event = new PointerEvent("pointerup", { bubbles: true, cancelable: true, button: 0 });

    const navigated = navigateQuickLinkPointerUp(event, NODE_ID, BASE, dragState);
    expect(navigated).toBe(true);
    expect(softNavCalls).toBe(1);
    expect(assignedUrl).toBeNull();
    expect(window.location.search).toContain(`node=${NODE_ID}`);
  });

  test("pointerup skips navigation after drag and clears didDrag", () => {
    const dragState = { didDrag: true };
    const event = new PointerEvent("pointerup", { bubbles: true, cancelable: true, button: 0 });

    const navigated = navigateQuickLinkPointerUp(event, NODE_ID, BASE, dragState);
    expect(navigated).toBe(false);
    expect(assignedUrl).toBeNull();
    expect(dragState.didDrag).toBe(false);
  });

  test("ctrl+pointerup opens node in new tab", () => {
    const dragState = { didDrag: false };
    const event = new PointerEvent("pointerup", {
      bubbles: true,
      cancelable: true,
      button: 0,
      ctrlKey: true,
    });

    const navigated = navigateQuickLinkPointerUp(event, NODE_ID, BASE, dragState);
    expect(navigated).toBe(true);
    expect(assignedUrl).toBeNull();
    expect(newTabHref).toContain(`node=${NODE_ID}`);
  });

  test("shift+pointerup opens node in new window", () => {
    const dragState = { didDrag: false };
    const event = new PointerEvent("pointerup", {
      bubbles: true,
      cancelable: true,
      button: 0,
      shiftKey: true,
    });

    const navigated = navigateQuickLinkPointerUp(event, NODE_ID, BASE, dragState);
    expect(navigated).toBe(true);
    expect(assignedUrl).toBeNull();
    expect(openedUrl).toContain(`node=${NODE_ID}`);
  });

  test("right pointerup does not navigate", () => {
    const dragState = { didDrag: false };
    const event = new PointerEvent("pointerup", { bubbles: true, cancelable: true, button: 2 });

    const navigated = navigateQuickLinkPointerUp(event, NODE_ID, BASE, dragState);
    expect(navigated).toBe(false);
    expect(assignedUrl).toBeNull();
  });
});

describe("navigateQuickLinkKeyboard", () => {
  let originalAssign: typeof window.location.assign;
  let assignedUrl: string | null = null;

  beforeEach(() => {
    originalAssign = window.location.assign.bind(window.location);
    assignedUrl = null;
    setStandaloneNavigationHandler(null);
    window.location.assign = ((url: string | URL) => {
      assignedUrl = String(url);
    }) as typeof window.location.assign;
  });

  afterEach(() => {
    window.location.assign = originalAssign;
    setStandaloneNavigationHandler(null);
  });

  test("Enter navigates to the node page", () => {
    const event = { key: "Enter", preventDefault: () => {} };
    expect(navigateQuickLinkKeyboard(event, NODE_ID, BASE)).toBe(true);
    expect(assignedUrl).toContain(`node=${NODE_ID}`);
  });
});
