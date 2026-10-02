import { describe, expect, test, afterEach } from "bun:test";
import { typeTableMarkerProperties } from "../src/node-capabilities";
import { getNodeDetail } from "../src/queries";
import { createNode } from "../src/node-create";
import { createTestContentFixture, destroyTestContentFixture, seedTestNode, seedTestTableSchema, type TestContentFixture, TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID, TEST_INSPIRATIONS_FEATURES_RELATIONSHIP_TYPE_ID } from "../src/content/test-helpers";
import { registerBidirectionalType, projectionTypeForEndpoint } from "tome-flatfile";
import { invalidateRelationshipTypesCache } from "tome-flatfile";

describe("createNode", async () => {
  let fixture: TestContentFixture;

  afterEach(async () => {
    if (fixture) await destroyTestContentFixture(fixture);
  });

  test("creates standalone node", async () => {
    fixture = await createTestContentFixture("tome-create-");
    const result = await createNode(fixture.ctx, { title: "New idea", body: "Notes here" });
    expect(result).toEqual({ id: expect.any(String), title: "New idea" });
    if (typeof result === "string") throw new Error("unexpected error");

    const detail = await getNodeDetail(fixture.ctx.cache, result.id);
    expect(detail?.title).toBe("New idea");
    expect(detail?.body).toBe("Notes here\n");
    expect(detail?.isTypeTable).toBe(false);
    expect(fixture.ctx.store.readNode(result.id)).not.toBeNull();
  });

  test("rejects empty title", async () => {
    fixture = await createTestContentFixture("tome-create-");
    expect(await createNode(fixture.ctx, { title: "   " })).toBe("invalid_title");
  });

  test("rejects Untitled title", async () => {
    fixture = await createTestContentFixture("tome-create-");
    expect(await createNode(fixture.ctx, { title: "Untitled" })).toBe("invalid_title");
  });

  test("creates outgoing relation row", async () => {
    fixture = await createTestContentFixture("tome-create-");
    const registry = fixture.ctx.store.readRelationshipTypesFile();
    const featuresRelationshipTypeId = registerBidirectionalType(registry, "Features", "Targets");
    fixture.ctx.store.writeRelationshipTypesFile(registry);
    invalidateRelationshipTypesCache();

    const sourceId = "0000000000000000000000001C";
    const featuresType = projectionTypeForEndpoint(featuresRelationshipTypeId, 0);
    await seedTestNode(fixture, {
      id: sourceId,
      properties: { title: "Scene" },
    });
    await seedTestNode(fixture, {
      id: "0000000000000000000000001W",
      properties: { title: "Existing feat" },
    });
    await fixture.ctx.store.upsertRelationship(sourceId, "0000000000000000000000001W", featuresType, {
      ordinal: 2,
    });
    await fixture.ctx.sync.syncRelationships();

    const result = await createNode(fixture.ctx, {
      title: "New feature",
      link: { kind: "outgoing", sourceId, type: featuresType },
    });
    if (typeof result === "string") throw new Error(result);

    const rel = fixture.ctx.store.findRelationship(sourceId, result.id, featuresType);
    expect(rel).not.toBeNull();
    expect(rel?.properties.ordinal).toBe(3);
  });

  test("creates database row without row_index stamping", async () => {
    fixture = await createTestContentFixture("tome-create-");
    const databaseId = "00000000000000000000000028";
    await seedTestNode(fixture, {
      id: databaseId,
      properties: typeTableMarkerProperties("Features"),
    });
    seedTestTableSchema(fixture, databaseId, []);
    await seedTestNode(fixture, {
      id: "0000000000000000000000002K",
      properties: { title: "Old row" },
    });
    await fixture.ctx.store.upsertRelationship("0000000000000000000000002K", databaseId, projectionTypeForEndpoint(TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID, 1), {});
    await fixture.ctx.sync.syncRelationships();

    const result = await createNode(fixture.ctx, {
      title: "Fresh row",
      link: { kind: "database-row", databaseId },
    });
    if (typeof result === "string") throw new Error(result);

    const rel = fixture.ctx.store.findRelationship(result.id, databaseId, "member_of");
    expect(rel?.properties.row_index).toBeUndefined();
    expect(rel?.properties.view).toBeUndefined();
  });

  test("returns source_not_found for missing parent", async () => {
    fixture = await createTestContentFixture("tome-create-");
    expect(
      await createNode(fixture.ctx, {
        title: "X",
        link: {
          kind: "outgoing",
          sourceId: "EEEEEEEEEEEEEEEEEEEEEEEEEE",
          type: "features",
        },
      }),
    ).toBe("source_not_found");
  });
});
