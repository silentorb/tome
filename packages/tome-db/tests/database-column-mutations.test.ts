import { describe, expect, test, afterAll, beforeAll } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  createDatabaseColumn,
  updateDatabaseColumn,
} from "../src/database-column-mutations";
import { getDatabaseViewDetail } from "../src/database-view";
import { IS_A_TYPE } from "../src/labels";
import { typeTableMarkerProperties } from "../src/node-capabilities";
import { invalidateSchemaCache } from "../src/schema-rules/load";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
  seedTestRelationships,
  seedTestTableSchema,
  seedTestViews,
} from "../src/content/test-helpers";
import { DEFAULT_CUSTOM_TAB } from "../src/content/views-file";

function seedSchema(fixture: ReturnType<typeof createTestContentFixture>): void {
  writeFileSync(
    join(fixture.ctx.store.contentDir, "model", "schema.json"),
    JSON.stringify({
      version: 1,
      relationshipRules: [],
      enums: {
        priority: {
          options: ["Low", "Medium", "High"],
          default: "Low",
          defaultOrder: "asc",
        },
      },
    }),
  );
  invalidateSchemaCache();
}

describe("database column mutations", () => {
  const fixture = createTestContentFixture("tome-db-col-mut-");

  beforeAll(() => {
    seedSchema(fixture);
  });

  test("createDatabaseColumn adds scalar column to schema", () => {
    const databaseId = "dddddddddddddddddddddddddddddddd";
    seedTestNode(fixture, {
      id: databaseId,
      properties: typeTableMarkerProperties("Features"),
    });
    seedTestTableSchema(fixture, databaseId, []);

    const result = createDatabaseColumn(fixture.ctx, databaseId, {
      name: "Priority",
      type: "select",
      enumId: "priority",
    });
    expect(result).toMatchObject({
      column: { key: "priority", name: "Priority", type: "select", enumId: "priority" },
      rowsMigrated: 0,
    });

    const detail = getDatabaseViewDetail(
      fixture.ctx.db,
      databaseId,
      undefined,
      fixture.ctx.store.contentDir,
    );
    expect(detail?.columns).toContain("priority");
  });

  test("createDatabaseColumn adds relation column", () => {
    const databaseId = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
    const parentDbId = "ffffffffffffffffffffffffffffffff";
    seedTestNode(fixture, {
      id: databaseId,
      properties: typeTableMarkerProperties("Features"),
    });
    seedTestNode(fixture, {
      id: parentDbId,
      properties: typeTableMarkerProperties("Parents"),
    });
    seedTestTableSchema(fixture, parentDbId, []);
    seedTestTableSchema(fixture, databaseId, []);

    const result = createDatabaseColumn(fixture.ctx, databaseId, {
      name: "Parents",
      type: "relation",
      targetTypeId: parentDbId,
      perspective: "parents",
    });
    expect(result).toMatchObject({
      column: {
        key: "parents",
        type: "relation",
        targetTypeId: parentDbId,
        perspective: "parents",
      },
    });
  });

  test("updateDatabaseColumn renames key and migrates row data", () => {
    const databaseId = "11111111111111111111111111111111";
    const pageId = "22222222222222222222222222222222";
    seedTestNode(fixture, {
      id: databaseId,
      properties: typeTableMarkerProperties("Notes"),
    });
    seedTestTableSchema(fixture, databaseId, [{ key: "notes", name: "Notes", type: "text" }]);
    seedTestNode(fixture, { id: pageId, properties: { title: "Row" } });
    seedTestRelationships(fixture, [
      {
        source: pageId,
        target: databaseId,
        type: IS_A_TYPE,
        properties: { notes: "Alpha" },
      },
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
                    id: "by-notes",
                    name: "By notes",
                    sorts: [{ column: "notes", direction: "asc" }],
                  },
                ],
              },
              columnOrder: ["notes"],
            },
          },
        },
      },
    });

    const result = updateDatabaseColumn(fixture.ctx, databaseId, "notes", {
      newKey: "description",
      name: "Description",
    });
    expect(result).toMatchObject({
      column: { key: "description", name: "Description" },
      rowsMigrated: 1,
    });

    const edge = fixture.ctx.db.listRelationshipsFromSource(pageId, IS_A_TYPE)[0];
    expect(edge?.properties.description).toBe("Alpha");
    expect(edge?.properties.notes).toBeUndefined();

    const views = fixture.ctx.store.readViewsFile();
    expect(views.nodes[databaseId]?.sections.items?.columnOrder).toEqual(["description"]);
  });

  test("updateDatabaseColumn scalar to relation clears scalars", () => {
    const databaseId = "33333333333333333333333333333333";
    const parentDbId = "44444444444444444444444444444444";
    const rowId = "55555555555555555555555555555555";
    seedTestNode(fixture, { id: databaseId, properties: typeTableMarkerProperties("Tasks") });
    seedTestNode(fixture, { id: parentDbId, properties: typeTableMarkerProperties("Parents") });
    seedTestTableSchema(fixture, parentDbId, []);
    seedTestTableSchema(fixture, databaseId, [{ key: "label", name: "Label", type: "text" }]);
    seedTestNode(fixture, { id: rowId, properties: { title: "Task" } });
    seedTestRelationships(fixture, [
      { source: rowId, target: databaseId, type: IS_A_TYPE, properties: { label: "Important" } },
    ]);

    const result = updateDatabaseColumn(fixture.ctx, databaseId, "label", {
      type: "relation",
      targetTypeId: parentDbId,
      perspective: "parents",
    });
    expect(result).toMatchObject({ valuesCleared: 1, relationsUnlinked: 0 });

    const edge = fixture.ctx.db.listRelationshipsFromSource(rowId, IS_A_TYPE)[0];
    expect(edge?.properties.label).toBeUndefined();
  });

  test("updateDatabaseColumn relation to scalar unlinks edges", () => {
    const databaseId = "66666666666666666666666666666666";
    const parentDbId = "77777777777777777777777777777777";
    const rowId = "88888888888888888888888888888888";
    const parentId = "99999999999999999999999999999999";
    seedTestNode(fixture, { id: databaseId, properties: typeTableMarkerProperties("Links") });
    seedTestNode(fixture, { id: parentDbId, properties: typeTableMarkerProperties("Parents") });
    seedTestTableSchema(fixture, parentDbId, []);
    seedTestTableSchema(fixture, databaseId, [
      {
        key: "parents",
        name: "Parents",
        type: "relation",
        targetTypeId: parentDbId,
        perspective: "parents",
      },
    ]);
    seedTestNode(fixture, { id: rowId, properties: { title: "Child" } });
    seedTestNode(fixture, { id: parentId, properties: { title: "Parent" } });
    seedTestRelationships(fixture, [
      { source: rowId, target: databaseId, type: IS_A_TYPE, properties: {} },
      { source: rowId, target: parentId, type: "parents", properties: {} },
    ]);

    const result = updateDatabaseColumn(fixture.ctx, databaseId, "parents", {
      type: "text",
      name: "Parents text",
    });
    expect(result).toMatchObject({ relationsUnlinked: 1 });

    expect(fixture.ctx.db.listRelationshipsFromSource(rowId, "parents")).toHaveLength(0);
  });

  test("updateDatabaseColumn relation target change unlinks old links", () => {
    const databaseId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa01";
    const parentDbId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa02";
    const otherParentDb = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa03";
    const rowId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa04";
    const parentId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa05";
    seedTestNode(fixture, { id: databaseId, properties: typeTableMarkerProperties("Items") });
    seedTestNode(fixture, { id: parentDbId, properties: typeTableMarkerProperties("Parents") });
    seedTestNode(fixture, { id: otherParentDb, properties: typeTableMarkerProperties("Other") });
    seedTestTableSchema(fixture, parentDbId, []);
    seedTestTableSchema(fixture, otherParentDb, []);
    seedTestTableSchema(fixture, databaseId, [
      {
        key: "parents",
        name: "Parents",
        type: "relation",
        targetTypeId: parentDbId,
        perspective: "parents",
      },
    ]);
    seedTestNode(fixture, { id: rowId, properties: { title: "Item" } });
    seedTestNode(fixture, { id: parentId, properties: { title: "Parent" } });
    seedTestRelationships(fixture, [
      { source: rowId, target: databaseId, type: IS_A_TYPE, properties: {} },
      { source: rowId, target: parentId, type: "parents", properties: {} },
    ]);

    const result = updateDatabaseColumn(fixture.ctx, databaseId, "parents", {
      targetTypeId: otherParentDb,
    });
    expect(result).toMatchObject({ relationsUnlinked: 1 });
    expect(fixture.ctx.db.listRelationshipsFromSource(rowId, "parents")).toHaveLength(0);
  });

  test("rejects duplicate and reserved keys", () => {
    const databaseId = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb01";
    seedTestNode(fixture, {
      id: databaseId,
      properties: typeTableMarkerProperties("Dup"),
    });
    seedTestTableSchema(fixture, databaseId, [
      { key: "existing", name: "Existing", type: "text" },
    ]);

    expect(
      createDatabaseColumn(fixture.ctx, databaseId, {
        name: "Existing",
        type: "text",
      }),
    ).toBe("column_key_taken");

    expect(
      createDatabaseColumn(fixture.ctx, databaseId, {
        key: "name",
        name: "Name",
        type: "text",
      }),
    ).toBe("invalid_key");
  });

  afterAll(() => {
    destroyTestContentFixture(fixture);
  });
});
