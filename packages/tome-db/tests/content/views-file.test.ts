import { describe, expect, test } from "bun:test";
import {
  emptyViewsFile,
  parseViewsFile,
  serializeViewsFile,
  slugifyTabId,
  uniqueTabId,
  VIEWS_FILE_VERSION,
} from "../../src/content/views-file";

describe("views-file", () => {
  test("round-trips custom and generated views", () => {
    const file = {
      version: VIEWS_FILE_VERSION,
      views: [
        {
          id: "all",
          nodeId: "dddddddddddddddddddddddddddddddd",
          relationshipType: "members",
          name: "All",
          sorts: [{ column: "name", direction: "asc" as const }],
          properties: { columnOrder: ["status", "priority"] },
          hiddenColumns: ["priority"],
        },
        {
          nodeId: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
          relationshipType: "members",
          generator: "scenes-by-book",
        },
      ],
    };
    const parsed = parseViewsFile(serializeViewsFile(file));
    expect(parsed).toEqual(file);
  });

  test("emptyViewsFile returns versioned empty views array", () => {
    expect(emptyViewsFile()).toEqual({ version: VIEWS_FILE_VERSION, views: [] });
  });

  test("slugifyTabId and uniqueTabId", () => {
    const ids = new Set<string>();
    expect(slugifyTabId("Prioritized")).toBe("prioritized");
    expect(uniqueTabId("all", ids)).toBe("all");
    ids.add("all");
    expect(uniqueTabId("all", ids)).toBe("all-2");
  });
});
