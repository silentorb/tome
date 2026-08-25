import { describe, expect, test, afterAll } from "bun:test";
import { writeFileSync } from "node:fs";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
  seedTestRelationships,
  seedTestTableSchema,
  TEST_INSPIRATIONS_FEATURES_ASSOCIATION_ID,
  TEST_MEMBER_OF_ASSOCIATION_ID,
  projectionTypeForEndpoint,
} from "tome-db/content/test-helpers";
import { invalidateAssociationsCache, invalidateSchemaCache } from "tome-db";
import { schemaFilePath } from "tome-db/content";
import { registerBidirectionalType } from "tome-flatfile";
import { createTestApiFromContent } from "./test-api-setup";

describe("relationship types API", () => {
  const sourceId = "0000000000000000000000001G";
  const targetId = "00000000000000000000000021";
  const sceneTypeId = "0000000000000000000000000D";
  const featureTypeId = "0000000000000000000000002P";

  const fixture = createTestContentFixture("tome-rel-types-api-");
  const registry = fixture.ctx.store.readAssociationsFile();
  registerBidirectionalType(registry, "Features", "Scenes", "000000000000000000000000B7");
  registry.associations["000000000000000000000000B7"] = {
    perspectives: ["Features", "Scenes"],
    endpoints: {
      "0": { typeId: sceneTypeId },
      "1": { typeId: featureTypeId },
    },
  };
  registerBidirectionalType(
    registry,
    "Inspirations",
    "Features",
    TEST_INSPIRATIONS_FEATURES_ASSOCIATION_ID,
  );
  fixture.ctx.store.writeAssociationsFile(registry);
  invalidateAssociationsCache();

  seedTestTableSchema(fixture, sceneTypeId, []);
  seedTestNode(fixture, { id: sourceId, properties: { title: "Scene page" } });
  seedTestNode(fixture, { id: targetId, properties: { title: "Feature page" } });
  seedTestRelationships(fixture, [
    { source: sourceId, target: sceneTypeId, type: "member_of" },
    { source: targetId, target: featureTypeId, type: "member_of" },
  ]);
  fixture.ctx.store.upsertRelationship(
    sourceId,
    targetId,
    projectionTypeForEndpoint(TEST_INSPIRATIONS_FEATURES_ASSOCIATION_ID, 0),
  );
  fixture.ctx.sync.syncRelationships();

  writeFileSync(
    schemaFilePath(fixture.ctx.store.contentDir),
    JSON.stringify({ version: 1, enums: {} }),
    "utf-8",
  );
  invalidateSchemaCache();

  const api = createTestApiFromContent(fixture);
  const featuresProjection = projectionTypeForEndpoint(TEST_INSPIRATIONS_FEATURES_ASSOCIATION_ID, 0);
  const memberProjection = projectionTypeForEndpoint(TEST_MEMBER_OF_ASSOCIATION_ID, 1);
  const b7Features = projectionTypeForEndpoint("000000000000000000000000B7", 0);

  test("GET /api/relationships/types lists distinct types in data", async () => {
    const res = await api.handler(new Request("http://127.0.0.1/api/relationships/types"));
    expect(res.status).toBe(200);
    const payload = (await res.json()) as { types: { type: string; label: string }[] };
    expect(payload.types).toContainEqual({ type: featuresProjection, label: "Inspirations" });
    expect(payload.types).toContainEqual({ type: memberProjection, label: "Membership" });
    expect(payload.types.every((item) => item.label && !item.label.includes(":"))).toBe(true);
  });

  test("GET relationship-link-options returns registry endpoint allowed targets", async () => {
    const res = await api.handler(
      new Request(
        `http://127.0.0.1/api/nodes/${sourceId}/relationship-link-options?type=${encodeURIComponent(b7Features)}`,
      ),
    );
    expect(res.status).toBe(200);
    const payload = (await res.json()) as { allowedTargetTypeIds: string[] | null };
    expect(payload.allowedTargetTypeIds).toEqual([featureTypeId]);
  });

  test("GET relationship-link-options returns null when no rule matches", async () => {
    const res = await api.handler(
      new Request(
        `http://127.0.0.1/api/nodes/${sourceId}/relationship-link-options?type=verses`,
      ),
    );
    expect(res.status).toBe(200);
    const payload = (await res.json()) as { allowedTargetTypeIds: string[] | null };
    expect(payload.allowedTargetTypeIds).toBeNull();
  });

  afterAll(() => {
    api.handler.close();
    destroyTestContentFixture(fixture);
  });
});
