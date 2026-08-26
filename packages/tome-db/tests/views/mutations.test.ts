import { describe, expect, test, afterAll } from "bun:test";
import { createTestContentFixture, destroyTestContentFixture, seedTestViews, TEST_MEMBER_OF_ASSOCIATION_ID } from "../../src/content/test-helpers";
import { VIEWS_FILE_VERSION } from "tome-flatfile";
import {
  createView,
  deleteView,
  reorderViews,
  updateView,
  updateRelationshipViewProperties,
} from "../../src/views/mutations";

describe("views mutations", () => {
  const fixture = createTestContentFixture("tome-views-mut-");
  const nodeId = "AAAAAAAAAAAAAAAAAAAAAAAAAA";

  seedTestViews(fixture, {
    version: VIEWS_FILE_VERSION,
    views: [
      {
        id: "all",
        nodeId,
        association: TEST_MEMBER_OF_ASSOCIATION_ID,
        name: "All",
        sorts: [{ column: "name", direction: "asc" }],
      },
    ],
  });

  test("creates and updates views", () => {
    const created = createView(fixture.ctx.graphStore, nodeId, TEST_MEMBER_OF_ASSOCIATION_ID, {
      name: "Sorted",
      sorts: [{ column: "priority", direction: "desc" }],
    });
    expect(created.name).toBe("Sorted");

    const updated = updateView(fixture.ctx.graphStore, nodeId, TEST_MEMBER_OF_ASSOCIATION_ID, created.id, {
      name: "Renamed",
    });
    expect(updated.name).toBe("Renamed");
  });

  test("updates relationship view properties on the first custom view", () => {
    const properties = updateRelationshipViewProperties(
      fixture.ctx.graphStore,
      nodeId,
      TEST_MEMBER_OF_ASSOCIATION_ID,
      ["status", "priority"],
    );
    expect(properties).toEqual(["status", "priority"]);
    const file = fixture.ctx.graphStore.readViews();
    const relationshipViews = file.views.filter(
      (view) => view.nodeId === nodeId && "id" in view && view.association === TEST_MEMBER_OF_ASSOCIATION_ID,
    );
    expect(relationshipViews[0]?.properties).toEqual(["status", "priority"]);
  });

  test("reorders custom views", () => {
    const reorderFixture = createTestContentFixture("tome-views-reorder-");
    seedTestViews(reorderFixture, {
      version: VIEWS_FILE_VERSION,
      views: [
        {
          id: "first",
          nodeId,
          association: TEST_MEMBER_OF_ASSOCIATION_ID,
          name: "First",
          sorts: [{ column: "name", direction: "asc" }],
        },
        {
          id: "second",
          nodeId,
          association: TEST_MEMBER_OF_ASSOCIATION_ID,
          name: "Second",
          sorts: [{ column: "name", direction: "asc" }],
        },
        {
          id: "third",
          nodeId,
          association: TEST_MEMBER_OF_ASSOCIATION_ID,
          name: "Third",
          sorts: [{ column: "name", direction: "asc" }],
        },
      ],
    });
    try {
      const reordered = reorderViews(reorderFixture.ctx.graphStore, nodeId, TEST_MEMBER_OF_ASSOCIATION_ID, [
        "third",
        "first",
        "second",
      ]);
      expect(reordered.map((view) => view.id)).toEqual(["third", "first", "second"]);
    } finally {
      destroyTestContentFixture(reorderFixture);
    }
  });

  test("updates properties allowlist on a single view without syncing siblings", () => {
    const propertiesFixture = createTestContentFixture("tome-views-properties-");
    seedTestViews(propertiesFixture, {
      version: VIEWS_FILE_VERSION,
      views: [
        {
          id: "all",
          nodeId,
          association: TEST_MEMBER_OF_ASSOCIATION_ID,
          name: "All",
          sorts: [{ column: "name", direction: "asc" }],
        },
        {
          id: "extra",
          nodeId,
          association: TEST_MEMBER_OF_ASSOCIATION_ID,
          name: "Extra",
          sorts: [{ column: "name", direction: "asc" }],
        },
      ],
    });
    try {
      updateView(propertiesFixture.ctx.graphStore, nodeId, TEST_MEMBER_OF_ASSOCIATION_ID, "all", {
        properties: ["status"],
      });
      updateView(propertiesFixture.ctx.graphStore, nodeId, TEST_MEMBER_OF_ASSOCIATION_ID, "extra", {
        properties: ["priority"],
      });
      const file = propertiesFixture.ctx.graphStore.readViews();
      const allView = file.views.find((view) => "id" in view && view.id === "all");
      const extraView = file.views.find((view) => "id" in view && view.id === "extra");
      expect(allView && "properties" in allView ? allView.properties : undefined).toEqual([
        "status",
      ]);
      expect(extraView && "properties" in extraView ? extraView.properties : undefined).toEqual([
        "priority",
      ]);
    } finally {
      destroyTestContentFixture(propertiesFixture);
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
          association: TEST_MEMBER_OF_ASSOCIATION_ID,
          name: "All",
          sorts: [{ column: "name", direction: "asc" }],
        },
      ],
    });
    try {
      expect(() => deleteView(soloFixture.ctx.graphStore, nodeId, TEST_MEMBER_OF_ASSOCIATION_ID, "all")).toThrow(
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
