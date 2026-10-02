import { describe, expect, test, afterAll } from "bun:test";
import { createTestContentFixture, destroyTestContentFixture, seedTestViews, TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID } from "../../src/content/test-helpers";
import { VIEWS_FILE_VERSION } from "tome-flatfile";
import {
  createView,
  deleteView,
  reorderViews,
  updateView,
  updateRelationshipViewProperties,
} from "../../src/views/mutations";

describe("views mutations", async () => {
  const fixture = await createTestContentFixture("tome-views-mut-");
  const nodeId = "AAAAAAAAAAAAAAAAAAAAAAAAAA";

  seedTestViews(fixture, {
    version: VIEWS_FILE_VERSION,
    views: [
      {
        id: "all",
        nodeId,
        association: TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID,
        name: "All",
        sorts: [{ column: "name", direction: "asc" }],
      },
    ],
  });

  test("creates and updates views", async () => {
    const created = await createView(fixture.ctx.graphStore, nodeId, TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID, {
      name: "Sorted",
      sorts: [{ column: "priority", direction: "desc" }],
    });
    expect(created.name).toBe("Sorted");

    const updated = await updateView(fixture.ctx.graphStore, nodeId, TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID, created.id, {
      name: "Renamed",
    });
    expect(updated.name).toBe("Renamed");
  });

  test("updates relationship view properties on the first custom view", async () => {
    const properties = await updateRelationshipViewProperties(
      fixture.ctx.graphStore,
      nodeId,
      TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID,
      ["status", "priority"],
    );
    expect(properties).toEqual(["status", "priority"]);
    const file = await fixture.ctx.graphStore.readViews();
    const relationshipViews = file.views.filter(
      (view) => view.nodeId === nodeId && "id" in view && view.association === TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID,
    );
    expect(relationshipViews[0]?.properties).toEqual(["status", "priority"]);
  });

  test("reorders custom views", async () => {
    const reorderFixture = await createTestContentFixture("tome-views-reorder-");
    seedTestViews(reorderFixture, {
      version: VIEWS_FILE_VERSION,
      views: [
        {
          id: "first",
          nodeId,
          association: TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID,
          name: "First",
          sorts: [{ column: "name", direction: "asc" }],
        },
        {
          id: "second",
          nodeId,
          association: TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID,
          name: "Second",
          sorts: [{ column: "name", direction: "asc" }],
        },
        {
          id: "third",
          nodeId,
          association: TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID,
          name: "Third",
          sorts: [{ column: "name", direction: "asc" }],
        },
      ],
    });
    try {
      const reordered = await reorderViews(reorderFixture.ctx.graphStore, nodeId, TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID, [
        "third",
        "first",
        "second",
      ]);
      expect(reordered.map((view) => view.id)).toEqual(["third", "first", "second"]);
    } finally {
      await destroyTestContentFixture(reorderFixture);
    }
  });

  test("updates properties allowlist on a single view without syncing siblings", async () => {
    const propertiesFixture = await createTestContentFixture("tome-views-properties-");
    seedTestViews(propertiesFixture, {
      version: VIEWS_FILE_VERSION,
      views: [
        {
          id: "all",
          nodeId,
          association: TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID,
          name: "All",
          sorts: [{ column: "name", direction: "asc" }],
        },
        {
          id: "extra",
          nodeId,
          association: TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID,
          name: "Extra",
          sorts: [{ column: "name", direction: "asc" }],
        },
      ],
    });
    try {
      await updateView(propertiesFixture.ctx.graphStore, nodeId, TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID, "all", {
        properties: ["status"],
      });
      await updateView(propertiesFixture.ctx.graphStore, nodeId, TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID, "extra", {
        properties: ["priority"],
      });
      const file = await propertiesFixture.ctx.graphStore.readViews();
      const allView = file.views.find((view) => "id" in view && view.id === "all");
      const extraView = file.views.find((view) => "id" in view && view.id === "extra");
      expect(allView && "properties" in allView ? allView.properties : undefined).toEqual([
        "status",
      ]);
      expect(extraView && "properties" in extraView ? extraView.properties : undefined).toEqual([
        "priority",
      ]);
    } finally {
      await destroyTestContentFixture(propertiesFixture);
    }
  });

  test("refuses to delete the last view", async () => {
    const soloFixture = await createTestContentFixture("tome-views-last-view-");
    seedTestViews(soloFixture, {
      version: VIEWS_FILE_VERSION,
      views: [
        {
          id: "all",
          nodeId,
          association: TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID,
          name: "All",
          sorts: [{ column: "name", direction: "asc" }],
        },
      ],
    });
    try {
      await expect(deleteView(soloFixture.ctx.graphStore, nodeId, TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID, "all")).rejects.toThrow(
        "last_view",
      );
    } finally {
      await destroyTestContentFixture(soloFixture);
    }
  });

  afterAll(async () => {
    await destroyTestContentFixture(fixture);
  });
});
