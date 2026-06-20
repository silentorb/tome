import { describe, expect, test } from "bun:test";
import { TEST_HOME_NODE_ID } from "tome-db/content/test-helpers";
import { buildSidebarIconMaps } from "../../src/webview/sidebar-nav";
import { iconToFaviconHref, resolveDocumentIcon } from "../../src/webview/document-icon";

const sidebarIconMaps = buildSidebarIconMaps([
  { nodeId: "204dba198db74611b0b49a98dd53e8f5", label: "Scenes", icon: "▶" },
  { nodeId: "dd0de9867cc345b898929306bdf9fc83", label: "Features", icon: "★" },
]);

describe("resolveDocumentIcon", () => {
  test("uses graph view icons", () => {
    expect(resolveDocumentIcon({ view: "graph-explorer" })).toBe("⊕");
  });

  test("uses home icon for the home node", () => {
    expect(
      resolveDocumentIcon({
        view: "node-page",
        nodeId: TEST_HOME_NODE_ID,
        homeId: TEST_HOME_NODE_ID,
      }),
    ).toBe("⌂");
  });

  test("prefers page emoji over type-based database icon", () => {
    expect(
      resolveDocumentIcon({
        view: "node-page",
        primaryTypeTitle: "Scenes",
        recordBody: "💡\n\n# Opening scene",
        sidebarIconByLabel: sidebarIconMaps.byLabel,
      }),
    ).toBe("💡");
  });

  test("uses type-title icon for database member pages", () => {
    expect(
      resolveDocumentIcon({
        view: "node-page",
        primaryTypeTitle: "Features",
        sidebarIconByLabel: sidebarIconMaps.byLabel,
      }),
    ).toBe("★");
  });

  test("uses sidebar icon for database hub nodes", () => {
    expect(
      resolveDocumentIcon({
        view: "node-page",
        nodeId: "204dba198db74611b0b49a98dd53e8f5",
        sidebarIconByNodeId: sidebarIconMaps.byNodeId,
      }),
    ).toBe("▶");
  });

  test("uses database icon for type table nodes", () => {
    expect(
      resolveDocumentIcon({
        view: "node-page",
        isTypeTable: true,
      }),
    ).toBe("▦");
  });

  test("falls back to default branding icon", () => {
    expect(resolveDocumentIcon({ view: "node-page" })).toBe("M");
    expect(
      resolveDocumentIcon({ view: "node-page", defaultDocumentIcon: "T" }),
    ).toBe("T");
  });
});

describe("iconToFaviconHref", () => {
  test("returns a png or svg data url", () => {
    const href = iconToFaviconHref("★");
    expect(href.startsWith("data:image/png,") || href.startsWith("data:image/svg+xml,")).toBe(
      true,
    );
    if (href.startsWith("data:image/svg+xml,")) {
      expect(decodeURIComponent(href.slice("data:image/svg+xml,".length))).toContain("★");
    }
  });
});
