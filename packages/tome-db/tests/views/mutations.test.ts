import { describe, expect, test, afterAll } from "bun:test";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestViews,
} from "../../src/content/test-helpers";
import { VIEWS_FILE_VERSION } from "../../src/content/views-file";
import { createTab, deleteTab, reorderSectionTabs, updateTab, updateSectionColumnOrder } from "../../src/views/mutations";

describe("views mutations", () => {
  const fixture = createTestContentFixture("tome-views-mut-");
  const nodeId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

  seedTestViews(fixture, {
    version: VIEWS_FILE_VERSION,
    nodes: {
      [nodeId]: {
        sections: {
          items: {
            tabs: {
              kind: "custom",
              definitions: [
                { id: "all", name: "All", sorts: [{ column: "name", direction: "asc" }] },
              ],
            },
          },
        },
      },
    },
  });

  test("creates and updates tabs", () => {
    const created = createTab(fixture.ctx.store, nodeId, "items", {
      name: "Sorted",
      sorts: [{ column: "priority", direction: "desc" }],
    });
    expect(created.name).toBe("Sorted");

    const updated = updateTab(fixture.ctx.store, nodeId, "items", created.id, {
      name: "Renamed",
    });
    expect(updated.name).toBe("Renamed");
  });

  test("updates section column order", () => {
    const order = updateSectionColumnOrder(fixture.ctx.store, nodeId, "items", [
      "status",
      "priority",
    ]);
    expect(order).toEqual(["status", "priority"]);
    const file = fixture.ctx.store.readViewsFile();
    expect(file.nodes[nodeId]?.sections.items?.columnOrder).toEqual(["status", "priority"]);
  });

  test("reorders custom tabs", () => {
    const reorderFixture = createTestContentFixture("tome-views-reorder-");
    seedTestViews(reorderFixture, {
      version: VIEWS_FILE_VERSION,
      nodes: {
        [nodeId]: {
          sections: {
            items: {
              tabs: {
                kind: "custom",
                definitions: [
                  { id: "first", name: "First", sorts: [{ column: "name", direction: "asc" }] },
                  { id: "second", name: "Second", sorts: [{ column: "name", direction: "asc" }] },
                  { id: "third", name: "Third", sorts: [{ column: "name", direction: "asc" }] },
                ],
              },
            },
          },
        },
      },
    });
    try {
      const reordered = reorderSectionTabs(reorderFixture.ctx.store, nodeId, "items", [
        "third",
        "first",
        "second",
      ]);
      expect(reordered.map((tab) => tab.id)).toEqual(["third", "first", "second"]);
    } finally {
      destroyTestContentFixture(reorderFixture);
    }
  });

  test("refuses to delete the last tab", () => {
    const soloFixture = createTestContentFixture("tome-views-last-tab-");
    seedTestViews(soloFixture, {
      version: VIEWS_FILE_VERSION,
      nodes: {
        [nodeId]: {
          sections: {
            items: {
              tabs: {
                kind: "custom",
                definitions: [
                  { id: "all", name: "All", sorts: [{ column: "name", direction: "asc" }] },
                ],
              },
            },
          },
        },
      },
    });
    try {
      expect(() => deleteTab(soloFixture.ctx.store, nodeId, "items", "all")).toThrow("last_tab");
    } finally {
      destroyTestContentFixture(soloFixture);
    }
  });

  afterAll(() => {
    destroyTestContentFixture(fixture);
  });
});
