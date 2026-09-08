import { describe, expect, test } from "bun:test";
import { TEST_HOME_NODE_ID } from "tome-db/content/test-helpers";
import {
  iconToFaviconHref,
  resolveDocumentIcon,
  resolveFaviconHref,
  documentIconImageApiUrl,
} from "../../src/webview/document-icon";

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

  test("prefers page emoji over branding", () => {
    expect(
      resolveDocumentIcon({
        view: "node-page",
        recordBody: "💡\n\n# Opening scene",
        defaultDocumentIcon: "M",
      }),
    ).toBe("💡");
  });

  test("falls back to default branding icon", () => {
    expect(resolveDocumentIcon({ view: "node-page" })).toBe("T");
    expect(
      resolveDocumentIcon({ view: "node-page", defaultDocumentIcon: "M" }),
    ).toBe("M");
  });
});

describe("resolveFaviconHref", () => {
  test("uses document icon image URL for branding default glyph", () => {
    const url = documentIconImageApiUrl("marloth");
    expect(
      resolveFaviconHref({
        view: "node-page",
        defaultDocumentIcon: "M",
        documentIconImageUrl: url,
      }),
    ).toBe(url);
  });

  test("keeps generated href when page emoji overrides branding", () => {
    const url = documentIconImageApiUrl();
    const href = resolveFaviconHref({
      view: "node-page",
      recordBody: "💡\n\n# Scene",
      defaultDocumentIcon: "M",
      documentIconImageUrl: url,
    });
    expect(href).not.toBe(url);
    expect(href.startsWith("data:image/")).toBe(true);
  });
});

describe("documentIconImageApiUrl", () => {
  test("omits corpusId in solo mode", () => {
    expect(documentIconImageApiUrl()).toBe("/api/workspace/document-icon");
    expect(documentIconImageApiUrl(null)).toBe("/api/workspace/document-icon");
  });

  test("includes corpusId query when set", () => {
    expect(documentIconImageApiUrl("translucence")).toBe(
      "/api/workspace/document-icon?corpusId=translucence",
    );
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
