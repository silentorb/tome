import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { createTestContentFixture, destroyTestContentFixture, seedTestNode, type TestContentFixture, TEST_MEMBER_OF_ASSOCIATION_ID } from "../src/content/test-helpers";
import { contentModelDir,
  associationsFilePath,
  schemaFilePath,
  tableSchemasFilePath, projectionTypeForEndpoint } from "tome-flatfile";
import { serializeSchemaFile } from "tome-flatfile";
import { serializeTableSchemasFile } from "tome-flatfile";
import { serializeAssociationsFile } from "tome-flatfile";
import { invalidateSchemaCache } from "tome-flatfile";
import { invalidateAssociationsCache } from "tome-flatfile";
import { invalidateTableSchemasCache } from "tome-flatfile";
import { createExtensionSchemaQueryServices } from "../src/extension-schema-query";

describe("createExtensionSchemaQueryServices", () => {
  let fixture: TestContentFixture;
  const sceneTypeId = "AAAAAAAAAAAAAAAAAAAAAAAAAA";
  const featureTypeId = "BBBBBBBBBBBBBBBBBBBBBBBBBB";
  const inspirationTypeId = "CCCCCCCCCCCCCCCCCCCCCCCCCC";

  fixture = createTestContentFixture("tome-schema-query-");
  const modelDir = contentModelDir(fixture.ctx.store.contentDir);
  mkdirSync(modelDir, { recursive: true });

  seedTestNode(fixture, {
    id: sceneTypeId,
    properties: { title: "Scene" },
  });
  seedTestNode(fixture, {
    id: featureTypeId,
    properties: { title: "Feature" },
  });
  seedTestNode(fixture, {
    id: inspirationTypeId,
    properties: { title: "Inspiration" },
  });

  writeFileSync(
    associationsFilePath(fixture.ctx.store.contentDir),
    serializeAssociationsFile({
      version: 1,
      associations: {
        "000000000000000000000000A1": {
          perspectives: ["Members", "Membership"],
          traits: ["set"],
        },
        "000000000000000000000000B7": {
          perspectives: ["Features", "Scenes"],
          endpoints: {
            0: { typeId: featureTypeId },
            1: { typeId: sceneTypeId },
          },
        },
        "000000000000000000000000B8": {
          perspectives: ["Inspirations", "Scenes"],
          endpoints: {
            0: { typeId: inspirationTypeId },
            1: { typeId: sceneTypeId },
          },
        },
        "000000000000000000000000B2": {
          perspectives: ["Features", "Inspirations"],
          endpoints: {
            0: { typeId: featureTypeId },
            1: { typeId: inspirationTypeId },
          },
        },
      },
    }),
    "utf-8",
  );
  invalidateAssociationsCache();

  writeFileSync(
    tableSchemasFilePath(fixture.ctx.store.contentDir),
    serializeTableSchemasFile({
      version: 1,
      tables: {
        [sceneTypeId]: {
          columns: [
            {
              key: "features",
              name: "Features",
              type: "relation",
              association: "000000000000000000000000B7",
            },
            {
              key: "inspirations",
              name: "Inspirations",
              type: "relation",
              association: "000000000000000000000000B8",
            },
          ],
        },
        [featureTypeId]: {
          columns: [
            {
              key: "inspirations",
              name: "Inspirations",
              type: "relation",
              association: "000000000000000000000000B2",
            },
          ],
        },
        [inspirationTypeId]: { columns: [] },
      },
    }),
    "utf-8",
  );
  invalidateTableSchemasCache();

  writeFileSync(
    schemaFilePath(fixture.ctx.store.contentDir),
    serializeSchemaFile({
      version: 1,
      relationshipRules: [],
      enums: {},
    }),
    "utf-8",
  );
  invalidateSchemaCache();

  fixture.ctx.sync.fullRebuild();

  const services = createExtensionSchemaQueryServices(
    fixture.ctx.cache,
    fixture.ctx.store.contentDir,
  );

  test("listTypeTables returns titles from graph", () => {
    const tables = services.listTypeTables();
    expect(tables).toEqual([
      { id: featureTypeId, title: "Feature", memberCount: 0 },
      { id: inspirationTypeId, title: "Inspiration", memberCount: 0 },
      { id: sceneTypeId, title: "Scene", memberCount: 0 },
    ]);
  });

  test("listTypeTables includes memberCount from set membership", async () => {
    const member1 = "DDDDDDDDDDDDDDDDDDDDDDDDDD";
    const member2 = "EEEEEEEEEEEEEEEEEEEEEEEEEE";
    seedTestNode(fixture, { id: member1, properties: { title: "Scene A" } });
    seedTestNode(fixture, { id: member2, properties: { title: "Scene B" } });
    fixture.ctx.cache.upsertRelationship(member1, sceneTypeId, projectionTypeForEndpoint(TEST_MEMBER_OF_ASSOCIATION_ID, 1), { row_index: 0 });
    fixture.ctx.cache.upsertRelationship(member2, sceneTypeId, projectionTypeForEndpoint(TEST_MEMBER_OF_ASSOCIATION_ID, 1), { row_index: 1 });

    const tables = await Promise.resolve(services.listTypeTables());
    const scene = tables.find((table) => table.id === sceneTypeId);
    expect(scene?.memberCount).toBe(2);
    expect(tables.find((table) => table.id === featureTypeId)?.memberCount).toBe(0);
  });

  test("listRelationshipRules returns rules from associations endpoints", () => {
    const rules = services.listRelationshipRules();
    expect(rules).toHaveLength(6);
    expect(rules).toContainEqual({
      id: "000000000000000000000000B7",
      sourceTypeId: featureTypeId,
      type: projectionTypeForEndpoint("000000000000000000000000B7", 0),
      allowedTargetTypeIds: [sceneTypeId],
    });
    expect(rules).toContainEqual({
      id: "000000000000000000000000B7",
      sourceTypeId: sceneTypeId,
      type: projectionTypeForEndpoint("000000000000000000000000B7", 1),
      allowedTargetTypeIds: [featureTypeId],
    });
    expect(rules).toContainEqual({
      id: "000000000000000000000000B8",
      sourceTypeId: inspirationTypeId,
      type: projectionTypeForEndpoint("000000000000000000000000B8", 0),
      allowedTargetTypeIds: [sceneTypeId],
    });
    expect(rules).toContainEqual({
      id: "000000000000000000000000B2",
      sourceTypeId: featureTypeId,
      type: projectionTypeForEndpoint("000000000000000000000000B2", 0),
      allowedTargetTypeIds: [inspirationTypeId],
    });
  });

  test("listRelationColumnEdges returns relation columns from table-schemas", () => {
    const edges = services.listRelationColumnEdges();
    expect(edges).toHaveLength(3);
    expect(edges).toEqual([
      {
        id: `${featureTypeId}:inspirations`,
        sourceTypeId: featureTypeId,
        targetTypeId: inspirationTypeId,
        label: projectionTypeForEndpoint("000000000000000000000000B2", 0),
      },
      {
        id: `${sceneTypeId}:features`,
        sourceTypeId: sceneTypeId,
        targetTypeId: featureTypeId,
        label: projectionTypeForEndpoint("000000000000000000000000B7", 1),
      },
      {
        id: `${sceneTypeId}:inspirations`,
        sourceTypeId: sceneTypeId,
        targetTypeId: inspirationTypeId,
        label: projectionTypeForEndpoint("000000000000000000000000B8", 1),
      },
    ]);
  });

  afterAll(() => {
    destroyTestContentFixture(fixture);
  });
});
