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

  writeFileSync(
    tableSchemasFilePath(fixture.ctx.store.contentDir),
    serializeTableSchemasFile({
      version: 1,
      tables: {
        [sceneTypeId]: { columns: [] },
        [featureTypeId]: { columns: [] },
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

  afterAll(() => {
    destroyTestContentFixture(fixture);
  });
});
