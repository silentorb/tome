import { describe, expect, test, afterAll } from "bun:test";
import { typeTableMarkerProperties } from "../src/node-capabilities";
import { getDatabaseViewDetail } from "../src/database-view";
import { deleteDatabaseColumn } from "../src/delete-database-column";
import { createTestContentFixture, destroyTestContentFixture, seedTestDynamicProperties, seedTestNode, seedTestRelationships, seedTestCompositeRelationships, seedTestTableSchema, seedTestViews, TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID, projectionTypeForEndpoint } from "../src/content/test-helpers";
describe("deleteDatabaseColumn", async () => {
  const fixture = await createTestContentFixture("tome-db-delete-col-");

  test("removes stored scalar from schema and all membership edges", async () => {
    const databaseId = "DDDDDDDDDDDDDDDDDDDDDDDDDD";
    const page1 = "AAAAAAAAAAAAAAAAAAAAAAAAAA";
    const page2 = "BBBBBBBBBBBBBBBBBBBBBBBBBB";
    await seedTestNode(fixture, {
      id: databaseId,
      properties: typeTableMarkerProperties("Features"),
    });
    seedTestTableSchema(fixture, databaseId, [
      { key: "priority", name: "Priority", type: "select", enumId: "priority" },
      { key: "task_state", name: "Task state", type: "select" },
    ]);
    await seedTestNode(fixture, { id: page1, properties: { title: "Feature A" } });
    await seedTestNode(fixture, { id: page2, properties: { title: "Feature B" } });
    await seedTestRelationships(fixture, [
      {
        source: page1,
        target: databaseId,
        type: "member_of",
        properties: { priority: "High", task_state: "Open", row_index: 0 },
      },
      {
        source: page2,
        target: databaseId,
        type: "member_of",
        properties: { priority: "Low", task_state: "Done", row_index: 1 },
      },
    ]);

    const result = await deleteDatabaseColumn(fixture.ctx, databaseId, "priority");
    expect(result).toEqual({ rowsAffected: 2, relationsUnlinked: 0 });

    const tableSchema = fixture.ctx.store.readTableSchemasFile().tables[databaseId];
    expect(tableSchema?.columns.some((col) => col.key === "priority")).toBe(false);

    const edge1 = (await fixture.ctx.cache.listRelationshipsFromSource(page1, projectionTypeForEndpoint(TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID, 1)))[0];
    expect(edge1?.properties.priority).toBeUndefined();
    expect(edge1?.properties.task_state).toBe("Open");
    expect(edge1?.properties.row_index).toBe(0);

    const detail = await getDatabaseViewDetail(fixture.ctx.cache, databaseId, undefined, fixture.ctx.store.contentDir);
    expect(detail?.columns).not.toContain("priority");
    expect(detail?.columns).toContain("task_state");
  });

  test("removes relation column from schema and unlinks all row edges", async () => {
    const databaseId = "EEEEEEEEEEEEEEEEEEEEEEEEEE";
    const pageId = "CCCCCCCCCCCCCCCCCCCCCCCCCC";
    const parentId = "FFFFFFFFFFFFFFFFFFFFFFFFFF";
    await seedTestNode(fixture, {
      id: databaseId,
      properties: typeTableMarkerProperties("Features"),
    });
    seedTestTableSchema(fixture, databaseId, [
      {
        key: "parents",
        name: "Parents",
        type: "relation",
        association: "000000000000000000000000B1",
              endpoint: 0,
      },
    ]);
    const registry = fixture.ctx.store.readRelationshipTypesFile();
    registry.relationshipTypes["000000000000000000000000B1"] = {
      perspectives: ["Children", "Parents"],
      endpoints: {
        0: { typeId: databaseId },
        1: { typeId: parentId },
      },
    };
    fixture.ctx.store.writeRelationshipTypesFile(registry);
    await seedTestNode(fixture, { id: pageId, properties: { title: "Child feature" } });
    await seedTestNode(fixture, { id: parentId, properties: { title: "Parent feature" } });
    await seedTestRelationships(fixture, [
      { source: pageId, target: databaseId, type: "member_of", properties: { row_index: 0 } },
    ]);
    await seedTestCompositeRelationships(fixture, [
      {
        a: pageId,
        b: parentId,
        typeFromA: "Children",
        typeFromB: "Parents",
        relationshipTypeId: "000000000000000000000000B1",
        properties: { ordinal: 0 },
      },
    ]);

    const result = await deleteDatabaseColumn(fixture.ctx, databaseId, "parents");
    expect(result).toEqual({ rowsAffected: 0, relationsUnlinked: 1 });

    const tableSchema = fixture.ctx.store.readTableSchemasFile().tables[databaseId];
    expect(tableSchema?.columns.some((col) => col.key === "parents")).toBe(false);
    expect(
      await fixture.ctx.cache.listRelationshipsFromSource(
        pageId,
        projectionTypeForEndpoint("000000000000000000000000B1", 0),
      ),
    ).toHaveLength(0);

    const detail = await getDatabaseViewDetail(fixture.ctx.cache, databaseId, undefined, fixture.ctx.store.contentDir);
    expect(detail?.columns).not.toContain("parents");
  });

  test("cleans views.json properties and tab sorts", async () => {
    const databaseId = "11111111111111111111111111";
    const pageId = "22222222222222222222222222";
    await seedTestNode(fixture, {
      id: databaseId,
      properties: typeTableMarkerProperties("Tasks"),
    });
    seedTestTableSchema(fixture, databaseId, [
      { key: "task_state", name: "Task state", type: "select" },
    ]);
    await seedTestNode(fixture, { id: pageId, properties: { title: "Task A" } });
    await seedTestRelationships(fixture, [
      { source: pageId, target: databaseId, type: "member_of", properties: { task_state: "Open" } },
    ]);
    seedTestViews(fixture, {
      version: 2,
      views: [
        {
          id: "by-task-state",
          nodeId: databaseId,
          association: TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID,
          name: "By task state",
          sorts: [{ column: "task_state", direction: "asc" }],
          properties: ["task_state"],
        },
      ],
    });

    await deleteDatabaseColumn(fixture.ctx, databaseId, "task_state");

    const views = fixture.ctx.store.readViewsFile();
    const view = views.views.find(
      (entry) => entry.nodeId === databaseId && "id" in entry && entry.id === "by-task-state",
    );
    expect(view && "properties" in view ? view.properties : undefined).toBeUndefined();
    expect(view && "sorts" in view ? view.sorts : undefined).toEqual([
      { column: "name", direction: "asc" },
    ]);
  });

  test("rejects dynamic columns", async () => {
    const databaseId = "33333333333333333333333333";
    await seedTestNode(fixture, {
      id: databaseId,
      properties: typeTableMarkerProperties("Characters"),
    });
    seedTestTableSchema(fixture, databaseId, []);
    seedTestDynamicProperties(fixture, [
      {
        id: "01TESTDYNAMICCOL00000000001",
        owner: databaseId,
        columnKey: "all_scene_count",
        columnName: "All scene count",
        columnType: "number",
        resolverId: "characters.allSceneCount",
      },
    ]);

    expect(await deleteDatabaseColumn(fixture.ctx, databaseId, "all_scene_count")).toBe(
      "column_not_deletable",
    );
  });

  test("returns column_not_found for unknown column", async () => {
    const databaseId = "44444444444444444444444444";
    await seedTestNode(fixture, {
      id: databaseId,
      properties: typeTableMarkerProperties("Features"),
    });
    seedTestTableSchema(fixture, databaseId, []);

    expect(await deleteDatabaseColumn(fixture.ctx, databaseId, "missing")).toBe("column_not_found");
  });

  afterAll(async () => {
    await destroyTestContentFixture(fixture);
  });
});
