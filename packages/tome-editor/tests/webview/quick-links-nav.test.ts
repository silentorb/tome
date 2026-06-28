import { describe, expect, test, afterEach, beforeEach } from "bun:test";
import type { WorkspaceQuickLink } from "tome-db";
import {
  buildQuickLinkIconMaps,
  navigateQuickLinkKeyboard,
  navigateQuickLinkPointerUp,
} from "../../src/webview/quick-links-nav";

const testQuickLinks: readonly WorkspaceQuickLink[] = [
  { nodeId: "dd0de9867cc345b898929306bdf9fc83", label: "Features", icon: "★" },
  { nodeId: "528384943746443a9c89699b57e3bbec", label: "Solutions", icon: "✓" },
  { nodeId: "204dba198db74611b0b49a98dd53e8f5", label: "Scenes", icon: "▶" },
  { nodeId: "2eea538996934ce8abafc27132e576c1", label: "Inspirations", icon: "✦" },
  { nodeId: "5a585a2a311c4768be4a81f27bdcdfb4", label: "Articles", icon: "§" },
  { nodeId: "f984a934ad644f8480b0f8f51449569f", label: "Characters", icon: "◎" },
  { nodeId: "df096ab26e8347e6992e95698345aad0", label: "Locations", icon: "⌖" },
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
    expect(byNodeId["204dba198db74611b0b49a98dd53e8f5"]).toBe("▶");
  });

  test("Inspirations links to the database, not the parent page", () => {
    const inspirations = testQuickLinks.find((link) => link.label === "Inspirations");
    expect(inspirations?.nodeId).toBe("2eea538996934ce8abafc27132e576c1");
    expect(inspirations?.nodeId).not.toBe("f8c501a697f94792a07c4c1bb7760d15");
  });

  test("returns empty maps for missing links", () => {
    expect(buildQuickLinkIconMaps([])).toEqual({ byNodeId: {}, byLabel: {} });
  });
});

const NODE_ID = "e5cc80dc61ed4c629951cdf472b20b7a";
const BASE = "http://127.0.0.1:5173/?node=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("navigateQuickLinkPointerUp", () => {
  let originalAssign: typeof window.location.assign;
  let originalCreateElement: typeof document.createElement;
  let assignedUrl: string | null = null;
  let newTabHref: string | null = null;

  beforeEach(() => {
    originalAssign = window.location.assign.bind(window.location);
    originalCreateElement = document.createElement.bind(document);
    assignedUrl = null;
    newTabHref = null;

    window.location.assign = ((url: string | URL) => {
      assignedUrl = String(url);
    }) as typeof window.location.assign;

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
    document.createElement = originalCreateElement;
  });

  test("pointerup navigates when drag did not activate", () => {
    const dragState = { didDrag: false };
    const event = new PointerEvent("pointerup", { bubbles: true, cancelable: true, button: 0 });

    const navigated = navigateQuickLinkPointerUp(event, NODE_ID, BASE, dragState);
    expect(navigated).toBe(true);
    expect(assignedUrl).toContain(`node=${NODE_ID}`);
    expect(dragState.didDrag).toBe(false);
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
    window.location.assign = ((url: string | URL) => {
      assignedUrl = String(url);
    }) as typeof window.location.assign;
  });

  afterEach(() => {
    window.location.assign = originalAssign;
  });

  test("Enter navigates to the node page", () => {
    const event = { key: "Enter", preventDefault: () => {} };
    expect(navigateQuickLinkKeyboard(event, NODE_ID, BASE)).toBe(true);
    expect(assignedUrl).toContain(`node=${NODE_ID}`);
  });
});
