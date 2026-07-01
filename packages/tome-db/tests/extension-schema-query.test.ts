import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
  type TestContentFixture,
} from "../src/content/test-helpers";
import { contentModelDir, schemaFilePath, tableSchemasFilePath } from "../src/content/paths";
import { serializeSchemaFile } from "../src/schema-rules/schema-file";
import { serializeTableSchemasFile } from "../src/content/table-schemas-file";
import { invalidateSchemaCache } from "../src/schema-rules/load";
import { invalidateTableSchemasCache } from "../src/table-schemas/load";
import { createExtensionSchemaQueryServices } from "../src/extension-schema-query";

describe("createExtensionSchemaQueryServices", () => {
  let fixture: TestContentFixture;
  const sceneTypeId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const featureTypeId = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const inspirationTypeId = "cccccccccccccccccccccccccccccccc";

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
              targetTypeId: featureTypeId,
              perspective: "features",
            },
            {
              key: "inspirations",
              name: "Inspirations",
              type: "relation",
              targetTypeId: inspirationTypeId,
              perspective: "inspirations",
            },
          ],
        },
        [featureTypeId]: {
          columns: [
            {
              key: "inspirations",
              name: "Inspirations",
              type: "relation",
              targetTypeId: inspirationTypeId,
              perspective: "inspirations",
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
      relationshipRules: [
        {
          id: "scene-features",
          sourceTypeId: sceneTypeId,
          type: "includes",
          allowedTargetTypeIds: [featureTypeId],
        },
      ],
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
      { id: featureTypeId, title: "Feature" },
      { id: inspirationTypeId, title: "Inspiration" },
      { id: sceneTypeId, title: "Scene" },
    ]);
  });

  test("listRelationshipRules returns schema rules", () => {
    const rules = services.listRelationshipRules();
    expect(rules).toHaveLength(1);
    expect(rules[0]).toEqual({
      id: "scene-features",
      sourceTypeId: sceneTypeId,
      type: "includes",
      allowedTargetTypeIds: [featureTypeId],
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
        label: "inspirations",
      },
      {
        id: `${sceneTypeId}:features`,
        sourceTypeId: sceneTypeId,
        targetTypeId: featureTypeId,
        label: "features",
      },
      {
        id: `${sceneTypeId}:inspirations`,
        sourceTypeId: sceneTypeId,
        targetTypeId: inspirationTypeId,
        label: "inspirations",
      },
    ]);
  });

  afterAll(() => {
    destroyTestContentFixture(fixture);
  });
});
