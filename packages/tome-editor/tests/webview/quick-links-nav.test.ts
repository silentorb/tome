import { describe, expect, test } from "bun:test";
import type { WorkspaceQuickLink } from "tome-graph-interfaces";
import { buildQuickLinkIconMaps, suppressNavigationClickAfterDragReorder } from "../../src/webview/quick-links-nav";

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

describe("suppressNavigationClickAfterDragReorder", () => {
  test("prevents default and clears dragCompleted after reorder", () => {
    const dragCompleted = { current: true };
    let prevented = false;
    suppressNavigationClickAfterDragReorder(
      { preventDefault: () => {
        prevented = true;
      } },
      dragCompleted,
    );
    expect(prevented).toBe(true);
    expect(dragCompleted.current).toBe(false);
  });

  test("does nothing when drag did not complete", () => {
    const dragCompleted = { current: false };
    let prevented = false;
    suppressNavigationClickAfterDragReorder(
      { preventDefault: () => {
        prevented = true;
      } },
      dragCompleted,
    );
    expect(prevented).toBe(false);
    expect(dragCompleted.current).toBe(false);
  });
});
