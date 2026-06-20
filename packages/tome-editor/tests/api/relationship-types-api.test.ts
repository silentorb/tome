import { describe, expect, test, afterAll } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
  seedTestRelationships,
} from "tome-db/content/test-helpers";
import { contentModelDir, schemaFilePath } from "tome-db/content";
import { createTestApiFromContent } from "./test-api-setup";

describe("relationship types API", () => {
  const sourceId = "a3333333333333333333333333333333";
  const targetId = "b3333333333333333333333333333333";
  const sceneTypeId = "204dba198db74611b0b49a98dd53e8f5";
  const featureTypeId = "dd0de9867cc345b898929306bdf9fc83";

  const fixture = createTestContentFixture("tome-rel-types-api-");
  seedTestNode(fixture, { id: sourceId, properties: { title: "Scene page" } });
  seedTestNode(fixture, { id: targetId, properties: { title: "Feature page" } });
  seedTestRelationships(fixture, [
    { source: sourceId, target: sceneTypeId, type: "is_a" },
    { source: targetId, target: featureTypeId, type: "is_a" },
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

  const api = createTestApiFromContent(fixture);

  test("GET /api/relationship-types lists distinct types in data", async () => {
    const res = await api.handler(new Request("http://127.0.0.1/api/relationship-types"));
    expect(res.status).toBe(200);
    const payload = (await res.json()) as { types: string[] };
    expect(payload.types).toContain("features");
    expect(payload.types).toContain("is_a");
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
        `http://127.0.0.1/api/nodes/${sourceId}/relationship-link-options?type=theme`,
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
