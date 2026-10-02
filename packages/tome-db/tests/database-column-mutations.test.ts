import { describe, expect, test, afterAll, beforeAll } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  createDatabaseColumn,
  updateDatabaseColumn,
} from "../src/database-column-mutations";
import { getDatabaseViewDetail } from "../src/database-view";
import { typeTableMarkerProperties } from "../src/node-capabilities";
import { invalidateSchemaCache } from "tome-flatfile";
import { createTestContentFixture, destroyTestContentFixture, seedTestNode, seedTestRelationships, seedTestCompositeRelationships, seedTestTableSchema, seedTestViews, TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID, projectionTypeForEndpoint } from "../src/content/test-helpers";

function seedParentsChildrenTypes(
  fixture: Awaited<ReturnType<typeof createTestContentFixture>>,
  childTypeId: string,
  parentTypeId: string,
  compositeKey = "000000000000000000000000B1",
): void {
  const file = fixture.ctx.store.readRelationshipTypesFile();
  file.relationshipTypes[compositeKey] = {
    perspectives: ["Children", "Parents"],
    endpoints: {
      0: { typeId: childTypeId },
      1: { typeId: parentTypeId },
    },
  };
  fixture.ctx.store.writeRelationshipTypesFile(file);
}

function seedSchema(fixture: Awaited<ReturnType<typeof createTestContentFixture>>): void {
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

describe("database column mutations", async () => {
  const fixture = await createTestContentFixture("tome-db-col-mut-");

  beforeAll(() => {
    seedSchema(fixture);
  });

  test("createDatabaseColumn adds scalar column to schema", async () => {
    const databaseId = "DDDDDDDDDDDDDDDDDDDDDDDDDD";
    await seedTestNode(fixture, {
      id: databaseId,
      properties: typeTableMarkerProperties("Features"),
    });
    seedTestTableSchema(fixture, databaseId, []);

    const result = await createDatabaseColumn(fixture.ctx, databaseId, {
      name: "Priority",
      type: "select",
      enumId: "priority",
    });
    expect(result).toMatchObject({
      column: { key: "priority", name: "Priority", type: "select", enumId: "priority" },
      rowsMigrated: 0,
    });

    const detail = await getDatabaseViewDetail(
      fixture.ctx.cache,
      databaseId,
      undefined,
      fixture.ctx.store.contentDir,
    );
    expect(detail?.columns).toContain("priority");
  });

  test("createDatabaseColumn adds relation column", async () => {
    const databaseId = "EEEEEEEEEEEEEEEEEEEEEEEEEE";
    const parentDbId = "FFFFFFFFFFFFFFFFFFFFFFFFFF";
    await seedTestNode(fixture, {
      id: databaseId,
      properties: typeTableMarkerProperties("Features"),
    });
    await seedTestNode(fixture, {
      id: parentDbId,
      properties: typeTableMarkerProperties("Parents"),
    });
    seedTestTableSchema(fixture, parentDbId, []);
    seedTestTableSchema(fixture, databaseId, []);

    seedParentsChildrenTypes(fixture, databaseId, parentDbId);

    const result = await createDatabaseColumn(fixture.ctx, databaseId, {
      name: "Parents",
      type: "relation",
      association: "000000000000000000000000B1",
              endpoint: 0,
    });
    expect(result).toMatchObject({
      column: {
        key: "parents",
        type: "relation",
        association: "000000000000000000000000B1",
              endpoint: 0,
      },
    });
  });

  test("updateDatabaseColumn renames key and migrates row data", async () => {
    const databaseId = "11111111111111111111111111";
    const pageId = "22222222222222222222222222";
    await seedTestNode(fixture, {
      id: databaseId,
      properties: typeTableMarkerProperties("Notes"),
    });
    seedTestTableSchema(fixture, databaseId, [{ key: "notes", name: "Notes", type: "text" }]);
    await seedTestNode(fixture, { id: pageId, properties: { title: "Row" } });
    await seedTestRelationships(fixture, [
      {
        source: pageId,
        target: databaseId,
        type: "member_of",
        properties: { notes: "Alpha" },
      },
    ]);
    seedTestViews(fixture, {
      version: 2,
      views: [
        {
          id: "by-notes",
          nodeId: databaseId,
          association: TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID,
          name: "By notes",
          sorts: [{ column: "notes", direction: "asc" }],
          properties: ["notes"],
        },
      ],
    });

    const result = await updateDatabaseColumn(fixture.ctx, databaseId, "notes", {
      newKey: "description",
      name: "Description",
    });
    expect(result).toMatchObject({
      column: { key: "description", name: "Description" },
      rowsMigrated: 1,
    });

    const edge = (await fixture.ctx.cache.listRelationshipsFromSource(pageId, projectionTypeForEndpoint(TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID, 1)))[0];
    expect(edge?.properties.description).toBe("Alpha");
    expect(edge?.properties.notes).toBeUndefined();

    const views = fixture.ctx.store.readViewsFile();
    const view = views.views.find(
      (entry) => entry.nodeId === databaseId && "id" in entry && entry.id === "by-notes",
    );
    expect(view && "properties" in view ? view.properties : undefined).toEqual(["description"]);
  });

  test("updateDatabaseColumn scalar to relation clears scalars", async () => {
    const databaseId = "33333333333333333333333333";
    const parentDbId = "44444444444444444444444444";
    const rowId = "55555555555555555555555555";
    await seedTestNode(fixture, { id: databaseId, properties: typeTableMarkerProperties("Tasks") });
    await seedTestNode(fixture, { id: parentDbId, properties: typeTableMarkerProperties("Parents") });
    seedTestTableSchema(fixture, parentDbId, []);
    seedTestTableSchema(fixture, databaseId, [{ key: "label", name: "Label", type: "text" }]);
    await seedTestNode(fixture, { id: rowId, properties: { title: "Task" } });
    await seedTestRelationships(fixture, [
      { source: rowId, target: databaseId, type: "member_of", properties: { label: "Important" } },
    ]);

    seedParentsChildrenTypes(fixture, databaseId, parentDbId);

    const result = await updateDatabaseColumn(fixture.ctx, databaseId, "label", {
      type: "relation",
      association: "000000000000000000000000B1",
              endpoint: 0,
    });
    expect(result).toMatchObject({ valuesCleared: 1, relationsUnlinked: 0 });

    const edge = (await fixture.ctx.cache.listRelationshipsFromSource(rowId, projectionTypeForEndpoint(TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID, 1)))[0];
    expect(edge?.properties.label).toBeUndefined();
  });

  test("updateDatabaseColumn relation to scalar unlinks edges", async () => {
    const databaseId = "66666666666666666666666666";
    const parentDbId = "77777777777777777777777777";
    const rowId = "88888888888888888888888888";
    const parentId = "99999999999999999999999999";
    await seedTestNode(fixture, { id: databaseId, properties: typeTableMarkerProperties("Links") });
    await seedTestNode(fixture, { id: parentDbId, properties: typeTableMarkerProperties("Parents") });
    seedTestTableSchema(fixture, parentDbId, []);
    seedTestTableSchema(fixture, databaseId, [
      {
        key: "parents",
        name: "Parents",
        type: "relation",
        association: "000000000000000000000000B1",
              endpoint: 0,
      },
    ]);
    seedParentsChildrenTypes(fixture, databaseId, parentDbId);
    await seedTestNode(fixture, { id: rowId, properties: { title: "Child" } });
    await seedTestNode(fixture, { id: parentId, properties: { title: "Parent" } });
    await seedTestRelationships(fixture, [
      { source: rowId, target: databaseId, type: "member_of", properties: {} },
    ]);
    await seedTestCompositeRelationships(fixture, [
      {
        a: rowId,
        b: parentId,
        typeFromA: "Children",
        typeFromB: "Parents",
        relationshipTypeId: "000000000000000000000000B1",
        properties: {},
      },
    ]);

    const result = await updateDatabaseColumn(fixture.ctx, databaseId, "parents", {
      type: "text",
      name: "Parents text",
    });
    expect(result).toMatchObject({ relationsUnlinked: 1 });

    expect(
      await fixture.ctx.cache.listRelationshipsFromSource(
        rowId,
        projectionTypeForEndpoint("000000000000000000000000B1", 0),
      ),
    ).toHaveLength(0);
  });

  test("updateDatabaseColumn relation target change unlinks old links", async () => {
    const databaseId = "0000000000000000000000001M";
    const parentDbId = "0000000000000000000000001N";
    const otherParentDb = "0000000000000000000000001P";
    const rowId = "0000000000000000000000001Q";
    const parentId = "0000000000000000000000001R";
    await seedTestNode(fixture, { id: databaseId, properties: typeTableMarkerProperties("Items") });
    await seedTestNode(fixture, { id: parentDbId, properties: typeTableMarkerProperties("Parents") });
    await seedTestNode(fixture, { id: otherParentDb, properties: typeTableMarkerProperties("Other") });
    seedTestTableSchema(fixture, parentDbId, []);
    seedTestTableSchema(fixture, otherParentDb, []);
    seedTestTableSchema(fixture, databaseId, [
      {
        key: "parents",
        name: "Parents",
        type: "relation",
        association: "000000000000000000000000B1",
              endpoint: 0,
      },
    ]);
    seedParentsChildrenTypes(fixture, databaseId, parentDbId);
    seedParentsChildrenTypes(fixture, databaseId, otherParentDb, "000000000000000000000000BE");
    await seedTestNode(fixture, { id: rowId, properties: { title: "Item" } });
    await seedTestNode(fixture, { id: parentId, properties: { title: "Parent" } });
    await seedTestRelationships(fixture, [
      { source: rowId, target: databaseId, type: "member_of", properties: {} },
    ]);
    await seedTestCompositeRelationships(fixture, [
      {
        a: rowId,
        b: parentId,
        typeFromA: "Children",
        typeFromB: "Parents",
        relationshipTypeId: "000000000000000000000000B1",
        properties: {},
      },
    ]);

    const result = await updateDatabaseColumn(fixture.ctx, databaseId, "parents", {
      association: "000000000000000000000000BE",
              endpoint: 0,
    });
    expect(result).toMatchObject({ relationsUnlinked: 1 });
    expect(
      await fixture.ctx.cache.listRelationshipsFromSource(
        rowId,
        projectionTypeForEndpoint("000000000000000000000000B1", 0),
      ),
    ).toHaveLength(0);
  });

  test("rejects duplicate and reserved keys", async () => {
    const databaseId = "00000000000000000000000025";
    await seedTestNode(fixture, {
      id: databaseId,
      properties: typeTableMarkerProperties("Dup"),
    });
    seedTestTableSchema(fixture, databaseId, [
      { key: "existing", name: "Existing", type: "text" },
    ]);

    expect(
      await createDatabaseColumn(fixture.ctx, databaseId, {
        name: "Existing",
        type: "text",
      }),
    ).toBe("column_key_taken");

    expect(
      await createDatabaseColumn(fixture.ctx, databaseId, {
        key: "name",
        name: "Name",
        type: "text",
      }),
    ).toBe("invalid_key");
  });

  afterAll(async () => {
    await destroyTestContentFixture(fixture);
  });
});
