import { describe, expect, test } from "bun:test";
import {
  emptyViewsFile,
  parseViewsFile,
  serializeViewsFile,
  slugifyTabId,
  uniqueTabId,
} from "../../src/content/views-file";

describe("views-file", () => {
  test("round-trips custom and generated section tabs", () => {
    const file = {
      version: 1,
      nodes: {
        dddddddddddddddddddddddddddddddd: {
          sections: {
            items: {
              columnOrder: ["status", "priority"],
              tabs: {
                kind: "custom" as const,
                definitions: [
                  {
                    id: "all",
                    name: "All",
                    sorts: [{ column: "name", direction: "asc" as const }],
                  },
                ],
              },
            },
          },
        },
        eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee: {
          sections: {
            items: {
              tabs: { kind: "generated" as const, provider: "scenes-by-book" },
            },
          },
        },
      },
    };
    const parsed = parseViewsFile(serializeViewsFile(file));
    expect(parsed).toEqual(file);
  });

  test("emptyViewsFile returns versioned empty nodes", () => {
    expect(emptyViewsFile()).toEqual({ version: 1, nodes: {} });
  });

  test("slugifyTabId and uniqueTabId", () => {
    const ids = new Set<string>();
    expect(slugifyTabId("Prioritized")).toBe("prioritized");
    expect(uniqueTabId("all", ids)).toBe("all");
    ids.add("all");
    expect(uniqueTabId("all", ids)).toBe("all-2");
  });
});
