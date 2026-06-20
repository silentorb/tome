import { describe, expect, test, afterAll } from "bun:test";
import { IS_A_TYPE } from "../src/labels";
import { typeTableMarkerProperties } from "../src/node-capabilities";
import { getDatabaseViewDetail } from "../src/database-view";
import { deleteDatabaseColumn } from "../src/delete-database-column";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestDynamicFields,
  seedTestNode,
  seedTestRelationships,
  seedTestTableSchema,
  seedTestViews,
} from "../src/content/test-helpers";
import { DEFAULT_CUSTOM_TAB } from "../src/content/views-file";

describe("deleteDatabaseColumn", () => {
  const fixture = createTestContentFixture("tome-db-delete-col-");

  test("removes stored scalar from schema and all membership edges", () => {
    const databaseId = "dddddddddddddddddddddddddddddddd";
    const page1 = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const page2 = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    seedTestNode(fixture, {
      id: databaseId,
      properties: typeTableMarkerProperties("Features"),
    });
    seedTestTableSchema(fixture, databaseId, [
      { key: "priority", name: "Priority", type: "select", enumId: "priority" },
      { key: "task_state", name: "Task state", type: "select" },
    ]);
    seedTestNode(fixture, { id: page1, properties: { title: "Feature A" } });
    seedTestNode(fixture, { id: page2, properties: { title: "Feature B" } });
    seedTestRelationships(fixture, [
      {
        source: page1,
        target: databaseId,
        type: IS_A_TYPE,
        properties: { priority: "High", task_state: "Open", row_index: 0 },
      },
      {
        source: page2,
        target: databaseId,
        type: IS_A_TYPE,
        properties: { priority: "Low", task_state: "Done", row_index: 1 },
      },
    ]);

    const result = deleteDatabaseColumn(fixture.ctx, databaseId, "priority");
    expect(result).toEqual({ rowsAffected: 2, relationsUnlinked: 0 });

    const tableSchema = fixture.ctx.store.readTableSchemasFile().tables[databaseId];
    expect(tableSchema?.columns.some((col) => col.key === "priority")).toBe(false);

    const edge1 = fixture.ctx.db.listRelationshipsFromSource(page1, IS_A_TYPE)[0];
    expect(edge1?.properties.priority).toBeUndefined();
    expect(edge1?.properties.task_state).toBe("Open");
    expect(edge1?.properties.row_index).toBe(0);

    const detail = getDatabaseViewDetail(fixture.ctx.db, databaseId, undefined, fixture.ctx.store.contentDir);
    expect(detail?.columns).not.toContain("priority");
    expect(detail?.columns).toContain("task_state");
  });

  test("removes relation column from schema and unlinks all row edges", () => {
    const databaseId = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
    const pageId = "cccccccccccccccccccccccccccccccc";
    const parentId = "ffffffffffffffffffffffffffffffff";
    seedTestNode(fixture, {
      id: databaseId,
      properties: typeTableMarkerProperties("Features"),
    });
    seedTestTableSchema(fixture, databaseId, [
      {
        key: "parents",
        name: "Parents",
        type: "relation",
        targetTypeId: parentId,
        perspective: "parents",
      },
    ]);
    seedTestNode(fixture, { id: pageId, properties: { title: "Child feature" } });
    seedTestNode(fixture, { id: parentId, properties: { title: "Parent feature" } });
    seedTestRelationships(fixture, [
      { source: pageId, target: databaseId, type: IS_A_TYPE, properties: { row_index: 0 } },
      {
        source: pageId,
        target: parentId,
        type: "parents",
        properties: { ordinal: 0 },
      },
    ]);

    const result = deleteDatabaseColumn(fixture.ctx, databaseId, "parents");
    expect(result).toEqual({ rowsAffected: 0, relationsUnlinked: 1 });

    const tableSchema = fixture.ctx.store.readTableSchemasFile().tables[databaseId];
    expect(tableSchema?.columns.some((col) => col.key === "parents")).toBe(false);
    expect(fixture.ctx.db.listRelationshipsFromSource(pageId, "parents")).toHaveLength(0);

    const detail = getDatabaseViewDetail(fixture.ctx.db, databaseId, undefined, fixture.ctx.store.contentDir);
    expect(detail?.columns).not.toContain("parents");
  });

  test("cleans views.json columnOrder and tab sorts", () => {
    const databaseId = "11111111111111111111111111111111";
    const pageId = "22222222222222222222222222222222";
    seedTestNode(fixture, {
      id: databaseId,
      properties: typeTableMarkerProperties("Tasks"),
    });
    seedTestTableSchema(fixture, databaseId, [
      { key: "task_state", name: "Task state", type: "select" },
    ]);
    seedTestNode(fixture, { id: pageId, properties: { title: "Task A" } });
    seedTestRelationships(fixture, [
      { source: pageId, target: databaseId, type: IS_A_TYPE, properties: { task_state: "Open" } },
    ]);
    seedTestViews(fixture, {
      version: 1,
      nodes: {
        [databaseId]: {
          sections: {
            items: {
              tabs: {
                kind: "custom",
                definitions: [
                  {
                    ...DEFAULT_CUSTOM_TAB,
                    id: "by-task-state",
                    name: "By task state",
                    sorts: [{ column: "task_state", direction: "asc" }],
                  },
                ],
              },
              columnOrder: ["task_state"],
            },
          },
        },
      },
    });

    deleteDatabaseColumn(fixture.ctx, databaseId, "task_state");

    const views = fixture.ctx.store.readViewsFile();
    const section = views.nodes[databaseId]?.sections.items;
    expect(section?.columnOrder).toBeUndefined();
    expect(section?.tabs).toMatchObject({
      kind: "custom",
      definitions: [{ sorts: [{ column: "name", direction: "asc" }] }],
    });
  });

  test("rejects dynamic columns", () => {
    const databaseId = "33333333333333333333333333333333";
    seedTestNode(fixture, {
      id: databaseId,
      properties: typeTableMarkerProperties("Characters"),
    });
    seedTestTableSchema(fixture, databaseId, []);
    seedTestDynamicFields(fixture, [
      {
        databaseId,
        columnKey: "all_scene_count",
        columnName: "All scene count",
        columnType: "number",
        resolverId: "characters.allSceneCount",
        docsPath: "docs/dynamic-fields/all-scene-count.md",
      },
    ]);

    expect(deleteDatabaseColumn(fixture.ctx, databaseId, "all_scene_count")).toBe(
      "column_not_deletable",
    );
  });

  test("returns column_not_found for unknown column", () => {
    const databaseId = "44444444444444444444444444444444";
    seedTestNode(fixture, {
      id: databaseId,
      properties: typeTableMarkerProperties("Features"),
    });
    seedTestTableSchema(fixture, databaseId, []);

    expect(deleteDatabaseColumn(fixture.ctx, databaseId, "missing")).toBe("column_not_found");
  });

  afterAll(() => {
    destroyTestContentFixture(fixture);
  });
});
