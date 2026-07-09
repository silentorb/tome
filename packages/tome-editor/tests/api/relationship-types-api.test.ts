import { describe, expect, test, afterAll } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
  seedTestRelationships,
  seedTestTableSchema,
} from "tome-db/content/test-helpers";
import { ORDERED_MEMBER_OF_TYPE } from "tome-db";
import { contentModelDir, schemaFilePath } from "tome-db/content";
import { invalidateSchemaCache } from "tome-db";
import { createTestApiFromContent } from "./test-api-setup";

describe("relationship types API", () => {
  const sourceId = "0000000000000000000000001G";
  const targetId = "00000000000000000000000021";
  const sceneTypeId = "0000000000000000000000000D";
  const featureTypeId = "0000000000000000000000002P";

  const fixture = createTestContentFixture("tome-rel-types-api-");
  seedTestTableSchema(fixture, sceneTypeId, [], "ordered_member_of");
  seedTestNode(fixture, { id: sourceId, properties: { title: "Scene page" } });
  seedTestNode(fixture, { id: targetId, properties: { title: "Feature page" } });
  seedTestRelationships(fixture, [
    { source: sourceId, target: sceneTypeId, type: ORDERED_MEMBER_OF_TYPE },
    { source: targetId, target: featureTypeId, type: "member_of" },
    { source: sourceId, target: targetId, type: "features" },
  ]);

  mkdirSync(contentModelDir(fixture.ctx.store.contentDir), { recursive: true });
  writeFileSync(
    schemaFilePath(fixture.ctx.store.contentDir),
    JSON.stringify({
      version: 1,
      relationshipRules: [
        {
          id: "scene-features",
          sourceTypeId: sceneTypeId,
          type: "includes",
          allowedTargetTypeIds: [featureTypeId],
        },
      ],
    }),
    "utf-8",
  );
  invalidateSchemaCache();

  const api = createTestApiFromContent(fixture);

  test("GET /api/relationship-types lists distinct types in data", async () => {
    const res = await api.handler(new Request("http://127.0.0.1/api/relationship-types"));
    expect(res.status).toBe(200);
    const payload = (await res.json()) as { types: string[] };
    expect(payload.types).toContain("features");
    expect(payload.types).toContain("member_of");
  });

  test("GET relationship-link-options returns schema allowed targets", async () => {
    const res = await api.handler(
      new Request(
        `http://127.0.0.1/api/nodes/${sourceId}/relationship-link-options?type=features`,
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
