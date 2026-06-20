import { describe, expect, test } from "bun:test";
import { formatDocumentTitle } from "../../src/webview/document-title";

describe("formatDocumentTitle", () => {
  test("uses node title on node page view", () => {
    expect(formatDocumentTitle("node-page", "Scene One")).toBe("Scene One · Tome");
  });

  test("omits suffix when node title matches app title", () => {
    expect(formatDocumentTitle("node-page", "Tome")).toBe("Tome");
  });

  test("falls back to app title when node has no title", () => {
    expect(formatDocumentTitle("node-page", null)).toBe("Tome");
  });

  test("labels graph views", () => {
    expect(formatDocumentTitle("graph-explorer")).toBe("Graph Explorer · Tome");
  });

  test("uses custom app title from workspace branding", () => {
    expect(formatDocumentTitle("node-page", "Scene One", "Marloth")).toBe("Scene One · Marloth");
    expect(formatDocumentTitle("graph-explorer", null, "Marloth")).toBe("Graph Explorer · Marloth");
    expect(formatDocumentTitle("node-page", "Marloth", "Marloth")).toBe("Marloth");
  });
});
