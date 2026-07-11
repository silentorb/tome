import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
  type TestContentFixture,
} from "../src/content/test-helpers";
import {
  contentModelDir,
  relationshipTypesFilePath,
  schemaFilePath,
  tableSchemasFilePath,
} from "../src/content/paths";
import { serializeSchemaFile } from "../src/schema-rules/schema-file";
import { serializeTableSchemasFile } from "../src/content/table-schemas-file";
import { serializeRelationshipTypesFile } from "../src/content/relationship-types-file";
import { invalidateSchemaCache } from "../src/schema-rules/load";
import { invalidateRelationshipTypesCache } from "../src/relationship-types/load";
import { invalidateTableSchemasCache } from "../src/table-schemas/load";
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
    relationshipTypesFilePath(fixture.ctx.store.contentDir),
    serializeRelationshipTypesFile({
      version: 1,
      types: {
        member_of: {
          perspectives: ["members", "member_of"],
          traits: ["set"],
        },
        scene_features: {
          perspectives: ["features", "scenes"],
          endpoints: {
            0: { typeId: featureTypeId },
            1: { typeId: sceneTypeId },
          },
        },
        scene_inspirations: {
          perspectives: ["inspirations", "scenes"],
          endpoints: {
            0: { typeId: inspirationTypeId },
            1: { typeId: sceneTypeId },
          },
        },
        inspirations_features: {
          perspectives: ["features", "inspirations"],
          endpoints: {
            0: { typeId: featureTypeId },
            1: { typeId: inspirationTypeId },
          },
        },
      },
    }),
    "utf-8",
  );
  invalidateRelationshipTypesCache();

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
              relationshipType: "scene_features",
            },
            {
              key: "inspirations",
              name: "Inspirations",
              type: "relation",
              relationshipType: "scene_inspirations",
            },
          ],
        },
        [featureTypeId]: {
          columns: [
            {
              key: "inspirations",
              name: "Inspirations",
              type: "relation",
              relationshipType: "inspirations_features",
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
    fixture.ctx.db,
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

  test("listTypeTables includes memberCount from set membership", () => {
    const member1 = "DDDDDDDDDDDDDDDDDDDDDDDDDD";
    const member2 = "EEEEEEEEEEEEEEEEEEEEEEEEEE";
    seedTestNode(fixture, { id: member1, properties: { title: "Scene A" } });
    seedTestNode(fixture, { id: member2, properties: { title: "Scene B" } });
    fixture.ctx.db.upsertRelationship(member1, sceneTypeId, "member_of", { row_index: 0 });
    fixture.ctx.db.upsertRelationship(member2, sceneTypeId, "member_of", { row_index: 1 });

    const tables = services.listTypeTables();
    const scene = tables.find((table) => table.id === sceneTypeId);
    expect(scene?.memberCount).toBe(2);
    expect(tables.find((table) => table.id === featureTypeId)?.memberCount).toBe(0);
  });

  test("listRelationshipRules returns rules from relationship-types endpoints", () => {
    const rules = services.listRelationshipRules();
    expect(rules).toHaveLength(6);
    expect(rules).toContainEqual({
      id: "scene_features",
      sourceTypeId: featureTypeId,
      type: "features",
      allowedTargetTypeIds: [sceneTypeId],
    });
    expect(rules).toContainEqual({
      id: "scene_features",
      sourceTypeId: sceneTypeId,
      type: "scenes",
      allowedTargetTypeIds: [featureTypeId],
    });
    expect(rules).toContainEqual({
      id: "scene_inspirations",
      sourceTypeId: inspirationTypeId,
      type: "inspirations",
      allowedTargetTypeIds: [sceneTypeId],
    });
    expect(rules).toContainEqual({
      id: "inspirations_features",
      sourceTypeId: featureTypeId,
      type: "features",
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
        label: "features",
      },
      {
        id: `${sceneTypeId}:features`,
        sourceTypeId: sceneTypeId,
        targetTypeId: featureTypeId,
        label: "scenes",
      },
      {
        id: `${sceneTypeId}:inspirations`,
        sourceTypeId: sceneTypeId,
        targetTypeId: inspirationTypeId,
        label: "scenes",
      },
    ]);
  });

  afterAll(() => {
    destroyTestContentFixture(fixture);
  });
});
