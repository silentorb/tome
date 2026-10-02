import { describe, expect, test, afterAll, beforeAll } from "bun:test";
import { writeFileSync } from "node:fs";
import { serializeSchemaFile } from "tome-flatfile";
import { createTestContentFixture, destroyTestContentFixture, seedTestNode, seedTestRelationships, projectionTypeForEndpoint, TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID } from "../../src/content/test-helpers";
import { SCHEMA_FILENAME, schemaFilePath } from "tome-flatfile";
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

describe("CacheSync schema enum causality", async () => {
  const fixture = await createTestContentFixture("tome-schema-enum-sync-");
  const pageId = "AAAAAAAAAAAAAAAAAAAAAAAAAA";
  const databaseId = "BBBBBBBBBBBBBBBBBBBBBBBBBB";
  let recordId: string;

  beforeAll(async () => {
    process.env.TOME_CONTENT_PATH = fixture.ctx.store.contentDir;
    writeFileSync(
      schemaFilePath(fixture.ctx.store.contentDir),
      serializeSchemaFile(SCHEMA_V1),
      "utf-8",
    );
    await seedTestNode(fixture, { id: databaseId, properties: { title: "Features" } });
    await seedTestNode(fixture, { id: pageId, properties: { title: "Feature A" } });
    await seedTestRelationships(fixture, [
      { source: pageId, target: databaseId, type: "member_of", properties: { priority: "High" } },
    ]);
    const edge = (await fixture.ctx.cache.listRelationshipsFromSource(pageId, projectionTypeForEndpoint(TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID, 1)))[0];
    recordId = edge!.recordId!;
  });

  test("stores priority index for initial schema option order", async () => {
    expect((await fixture.ctx.cache.listRelationshipsFromSource(pageId, projectionTypeForEndpoint(TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID, 1)))[0]?.properties.priority).toBe(
      "High",
    );

    expect(
      (await fixture.ctx.cache.queryAll<{ priority: number | null }>(
        "SELECT priority FROM relationship_records WHERE id = ?",
        recordId,
      ))[0]?.priority,
    ).toBe(2);
  });

  test("re-encodes enum indices when schema option order changes", async () => {
    writeFileSync(
      schemaFilePath(fixture.ctx.store.contentDir),
      serializeSchemaFile(SCHEMA_V2),
      "utf-8",
    );
    await fixture.ctx.sync.syncFile(SCHEMA_FILENAME);

    expect((await fixture.ctx.cache.listRelationshipsFromSource(pageId, projectionTypeForEndpoint(TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID, 1)))[0]?.properties.priority).toBe(
      "High",
    );

    expect(
      (await fixture.ctx.cache.queryAll<{ priority: number | null }>(
        "SELECT priority FROM relationship_records WHERE id = ?",
        recordId,
      ))[0]?.priority,
    ).toBe(3);

    expect(await fixture.ctx.cache.getMeta("enum_config_fingerprint")).toBe(
      enumConfigFingerprint(SCHEMA_V2),
    );
  });

  test("cacheNeedsRebuild detects stale enum fingerprint without content mtime change", async () => {
    await fixture.ctx.cache.setMeta("enum_config_fingerprint", "stale");
    expect(await fixture.ctx.sync.cacheNeedsRebuild()).toBe(true);
  });

  afterAll(async () => {
    delete process.env.TOME_CONTENT_PATH;
    await destroyTestContentFixture(fixture);
  });
});
