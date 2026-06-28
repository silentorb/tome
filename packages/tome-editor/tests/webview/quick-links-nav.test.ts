import { describe, expect, test } from "bun:test";
import type { WorkspaceQuickLink } from "tome-db";
import { buildQuickLinkIconMaps } from "../../src/webview/quick-links-nav";

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
