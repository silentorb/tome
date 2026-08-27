import { describe, expect, test } from "bun:test";
import {
  emptyViewsFile,
  parseViewsFile,
  serializeViewsFile,
  slugifyTabId,
  uniqueTabId,
  VIEWS_FILE_VERSION,
} from "../../src/content/views-file";

const TEST_MEMBER_OF_ASSOCIATION_ID = "000000000000000000000000A1";

describe("views-file", () => {
  test("round-trips custom and generated views", () => {
    const file = {
      version: VIEWS_FILE_VERSION,
      views: [
        {
          id: "all",
          nodeId: "DDDDDDDDDDDDDDDDDDDDDDDDDD",
          association: TEST_MEMBER_OF_ASSOCIATION_ID,
          name: "All",
          sorts: [{ column: "name", direction: "asc" as const }],
          properties: ["status"],
        },
        {
          nodeId: "EEEEEEEEEEEEEEEEEEEEEEEEEE",
          association: TEST_MEMBER_OF_ASSOCIATION_ID,
          generator: "scenes-by-book",
        },
      ],
    };
    const parsed = parseViewsFile(serializeViewsFile(file));
    expect(parsed).toEqual(file);
  });

  test("rejects legacy hiddenColumns and columnOrder shapes", () => {
    const legacy = serializeViewsFile({
      version: VIEWS_FILE_VERSION,
      views: [
        {
          id: "all",
          nodeId: "DDDDDDDDDDDDDDDDDDDDDDDDDD",
          association: TEST_MEMBER_OF_ASSOCIATION_ID,
          name: "All",
          sorts: [{ column: "name", direction: "asc" }],
          hiddenColumns: ["priority"],
        },
      ],
    } as unknown as Parameters<typeof serializeViewsFile>[0]);
    expect(() => parseViewsFile(legacy)).toThrow("hiddenColumns is not supported");

    const columnOrder = serializeViewsFile({
      version: VIEWS_FILE_VERSION,
      views: [
        {
          id: "all",
          nodeId: "DDDDDDDDDDDDDDDDDDDDDDDDDD",
          association: TEST_MEMBER_OF_ASSOCIATION_ID,
          name: "All",
          sorts: [{ column: "name", direction: "asc" }],
          properties: { columnOrder: ["status"] },
        },
      ],
    } as unknown as Parameters<typeof serializeViewsFile>[0]);
    expect(() => parseViewsFile(columnOrder)).toThrow(
      "properties must be a string array (not { columnOrder })",
    );
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
