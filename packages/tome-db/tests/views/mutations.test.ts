import { describe, expect, test, afterAll } from "bun:test";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestViews,
} from "../../src/content/test-helpers";
import { VIEWS_FILE_VERSION } from "../../src/content/views-file";
import {
  createView,
  deleteView,
  reorderViews,
  updateView,
  updateRelationshipViewProperties,
} from "../../src/views/mutations";

describe("views mutations", () => {
  const fixture = createTestContentFixture("tome-views-mut-");
  const nodeId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

  seedTestViews(fixture, {
    version: VIEWS_FILE_VERSION,
    views: [
      {
        id: "all",
        nodeId,
        relationshipType: "members",
        name: "All",
        sorts: [{ column: "name", direction: "asc" }],
      },
    ],
  });

  test("creates and updates views", () => {
    const created = createView(fixture.ctx.store, nodeId, "members", {
      name: "Sorted",
      sorts: [{ column: "priority", direction: "desc" }],
    });
    expect(created.name).toBe("Sorted");

    const updated = updateView(fixture.ctx.store, nodeId, "members", created.id, {
      name: "Renamed",
    });
    expect(updated.name).toBe("Renamed");
  });

  test("updates relationship view properties column order on all sibling views", () => {
    const properties = updateRelationshipViewProperties(fixture.ctx.store, nodeId, "members", {
      columnOrder: ["status", "priority"],
    });
    expect(properties.columnOrder).toEqual(["status", "priority"]);
    const file = fixture.ctx.store.readViewsFile();
    for (const view of file.views) {
      if (view.nodeId === nodeId && "id" in view) {
        expect(view.properties?.columnOrder).toEqual(["status", "priority"]);
      }
    }
  });

  test("reorders custom views", () => {
    const reorderFixture = createTestContentFixture("tome-views-reorder-");
    seedTestViews(reorderFixture, {
      version: VIEWS_FILE_VERSION,
      views: [
        {
          id: "first",
          nodeId,
          relationshipType: "members",
          name: "First",
          sorts: [{ column: "name", direction: "asc" }],
        },
        {
          id: "second",
          nodeId,
          relationshipType: "members",
          name: "Second",
          sorts: [{ column: "name", direction: "asc" }],
        },
        {
          id: "third",
          nodeId,
          relationshipType: "members",
          name: "Third",
          sorts: [{ column: "name", direction: "asc" }],
        },
      ],
    });
    try {
      const reordered = reorderViews(reorderFixture.ctx.store, nodeId, "members", [
        "third",
        "first",
        "second",
      ]);
      expect(reordered.map((view) => view.id)).toEqual(["third", "first", "second"]);
    } finally {
      destroyTestContentFixture(reorderFixture);
    }
  });

  test("refuses to delete the last view", () => {
    const soloFixture = createTestContentFixture("tome-views-last-view-");
    seedTestViews(soloFixture, {
      version: VIEWS_FILE_VERSION,
      views: [
        {
          id: "all",
          nodeId,
          relationshipType: "members",
          name: "All",
          sorts: [{ column: "name", direction: "asc" }],
        },
      ],
    });
    try {
      expect(() => deleteView(soloFixture.ctx.store, nodeId, "members", "all")).toThrow(
        "last_view",
      );
    } finally {
      destroyTestContentFixture(soloFixture);
    }
  });

  afterAll(() => {
    destroyTestContentFixture(fixture);
  });
});
