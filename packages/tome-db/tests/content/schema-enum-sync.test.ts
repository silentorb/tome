import { describe, expect, test, afterAll, beforeAll } from "bun:test";
import { Database } from "bun:sqlite";
import { writeFileSync } from "node:fs";
import { IS_A_TYPE } from "../../src/labels";
import { serializeSchemaFile } from "../../src/schema-rules/schema-file";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
  seedTestRelationships,
} from "../../src/content/test-helpers";
import { SCHEMA_FILENAME, schemaFilePath } from "../../src/content/paths";
import { enumConfigFingerprint } from "../../src/enum-config-fingerprint";

const SCHEMA_V1 = {
  version: 1,
  relationshipRules: [],
  enums: {
    priority: {
      options: ["Low", "Medium", "High", "Consideration"],
      default: "Low",
      defaultOrder: "desc" as const,
      values: { Low: 1, Medium: 2, High: 4, Consideration: 0 },
    },
  },
};

const SCHEMA_V2 = {
  ...SCHEMA_V1,
  enums: {
    priority: {
      ...SCHEMA_V1.enums.priority,
      options: ["Consideration", "Low", "Medium", "High"],
    },
  },
};

describe("CacheSync schema enum causality", () => {
  const fixture = createTestContentFixture("tome-schema-enum-sync-");
  const pageId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const databaseId = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  let recordId: string;

  beforeAll(() => {
    process.env.TOME_CONTENT_PATH = fixture.ctx.store.contentDir;
    writeFileSync(
      schemaFilePath(fixture.ctx.store.contentDir),
      serializeSchemaFile(SCHEMA_V1),
      "utf-8",
    );
    seedTestNode(fixture, { id: databaseId, properties: { title: "Features", notion_schema: {} } });
    seedTestNode(fixture, { id: pageId, properties: { title: "Feature A" } });
    seedTestRelationships(fixture, [
      { source: pageId, target: databaseId, type: IS_A_TYPE, properties: { priority: "High" } },
    ]);
    const edge = fixture.ctx.db.listRelationshipsFromSource(pageId, IS_A_TYPE)[0];
    recordId = edge!.recordId!;
  });

  test("stores priority index for initial schema option order", () => {
    expect(fixture.ctx.db.listRelationshipsFromSource(pageId, IS_A_TYPE)[0]?.properties.priority).toBe(
      "High",
    );

    const rawDb = new Database(fixture.ctx.db.path);
    const raw = rawDb
      .prepare("SELECT properties FROM relationship_records WHERE id = ?")
      .get(recordId) as { properties: string };
    rawDb.close();
    expect(JSON.parse(raw.properties).priority).toBe(2);
  });

  test("re-encodes enum indices when schema option order changes", () => {
    writeFileSync(
      schemaFilePath(fixture.ctx.store.contentDir),
      serializeSchemaFile(SCHEMA_V2),
      "utf-8",
    );
    fixture.ctx.sync.syncFile(SCHEMA_FILENAME);

    expect(fixture.ctx.db.listRelationshipsFromSource(pageId, IS_A_TYPE)[0]?.properties.priority).toBe(
      "High",
    );

    const rawDb = new Database(fixture.ctx.db.path);
    const raw = rawDb
      .prepare("SELECT properties FROM relationship_records WHERE id = ?")
      .get(recordId) as { properties: string };
    rawDb.close();
    expect(JSON.parse(raw.properties).priority).toBe(3);

    expect(fixture.ctx.db.getMeta("enum_config_fingerprint")).toBe(
      enumConfigFingerprint(SCHEMA_V2),
    );
  });

  test("cacheNeedsRebuild detects stale enum fingerprint without content mtime change", () => {
    fixture.ctx.db.setMeta("enum_config_fingerprint", "stale");
    expect(fixture.ctx.sync.cacheNeedsRebuild()).toBe(true);
  });

  afterAll(() => {
    delete process.env.TOME_CONTENT_PATH;
    destroyTestContentFixture(fixture);
  });
});
