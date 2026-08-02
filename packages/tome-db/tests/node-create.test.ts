import { describe, expect, test, afterEach } from "bun:test";
import { typeTableMarkerProperties } from "../src/node-capabilities";
import { getNodeDetail } from "../src/queries";
import { createNode } from "../src/node-create";
import { createTestContentFixture, destroyTestContentFixture, seedTestNode, seedTestTableSchema, type TestContentFixture, TEST_MEMBER_OF_ASSOCIATION_ID, TEST_INSPIRATIONS_FEATURES_ASSOCIATION_ID } from "../src/content/test-helpers";
import { registerBidirectionalType, projectionTypeForEndpoint } from "tome-flatfile";
import { invalidateAssociationsCache } from "tome-flatfile";

describe("createNode", () => {
  let fixture: TestContentFixture;

  afterEach(() => {
    if (fixture) destroyTestContentFixture(fixture);
  });

  test("creates standalone node", () => {
    fixture = createTestContentFixture("tome-create-");
    const result = createNode(fixture.ctx, { title: "New idea", body: "Notes here" });
    expect(result).toEqual({ id: expect.any(String), title: "New idea" });
    if (typeof result === "string") throw new Error("unexpected error");

    const detail = getNodeDetail(fixture.ctx.cache, result.id);
    expect(detail?.title).toBe("New idea");
    expect(detail?.body).toBe("Notes here\n");
    expect(detail?.isTypeTable).toBe(false);
    expect(fixture.ctx.store.readNode(result.id)).not.toBeNull();
  });

  test("rejects empty title", () => {
    fixture = createTestContentFixture("tome-create-");
    expect(createNode(fixture.ctx, { title: "   " })).toBe("invalid_title");
  });

  test("rejects Untitled title", () => {
    fixture = createTestContentFixture("tome-create-");
    expect(createNode(fixture.ctx, { title: "Untitled" })).toBe("invalid_title");
  });

  test("creates outgoing relation row", () => {
    fixture = createTestContentFixture("tome-create-");
    const registry = fixture.ctx.store.readAssociationsFile();
    const featuresAssociationId = registerBidirectionalType(registry, "Features", "Targets");
    fixture.ctx.store.writeAssociationsFile(registry);
    invalidateAssociationsCache();

    const sourceId = "0000000000000000000000001C";
    const featuresType = projectionTypeForEndpoint(featuresAssociationId, 0);
    seedTestNode(fixture, {
      id: sourceId,
      properties: { title: "Scene" },
    });
    seedTestNode(fixture, {
      id: "0000000000000000000000001W",
      properties: { title: "Existing feat" },
    });
    fixture.ctx.store.upsertRelationship(sourceId, "0000000000000000000000001W", featuresType, {
      ordinal: 2,
    });
    fixture.ctx.sync.syncRelationships();

    const result = createNode(fixture.ctx, {
      title: "New feature",
      link: { kind: "outgoing", sourceId, type: featuresType },
    });
    if (typeof result === "string") throw new Error(result);

    const rel = fixture.ctx.store.findRelationship(sourceId, result.id, featuresType);
    expect(rel).not.toBeNull();
    expect(rel?.properties.ordinal).toBe(3);
  });

  test("creates database row without row_index stamping", () => {
    fixture = createTestContentFixture("tome-create-");
    const databaseId = "00000000000000000000000028";
    seedTestNode(fixture, {
      id: databaseId,
      properties: typeTableMarkerProperties("Features"),
    });
    seedTestTableSchema(fixture, databaseId, []);
    seedTestNode(fixture, {
      id: "0000000000000000000000002K",
      properties: { title: "Old row" },
    });
    fixture.ctx.store.upsertRelationship("0000000000000000000000002K", databaseId, projectionTypeForEndpoint(TEST_MEMBER_OF_ASSOCIATION_ID, 1), {});
    fixture.ctx.sync.syncRelationships();

    const result = createNode(fixture.ctx, {
      title: "Fresh row",
      link: { kind: "database-row", databaseId },
    });
    if (typeof result === "string") throw new Error(result);

    const rel = fixture.ctx.store.findRelationship(result.id, databaseId, "member_of");
    expect(rel?.properties.row_index).toBeUndefined();
    expect(rel?.properties.view).toBeUndefined();
  });

  test("returns source_not_found for missing parent", () => {
    fixture = createTestContentFixture("tome-create-");
    expect(
      createNode(fixture.ctx, {
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
