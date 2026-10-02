import { describe, expect, test, afterAll } from "bun:test";
import { typeTableMarkerProperties } from "../src/node-capabilities";
import { updateDatabaseRowProperty, updateOutgoingRelationshipProperty } from "../src/relationship-property-update";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestRelationships,
  seedTestCompositeRelationships,
  seedTestNode,
  projectionTypeForEndpoint,
  TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID,
  TEST_RELATED_ASSOCIATION_ID,
} from "../src/content/test-helpers";

const RELATED_TYPE = projectionTypeForEndpoint(TEST_RELATED_ASSOCIATION_ID, 0);

describe("relationship-property-update", async () => {
  const fixture = await createTestContentFixture("tome-db-conn-prop-");

  test("updates priority on database membership edge", async () => {
    const databaseId = "DDDDDDDDDDDDDDDDDDDDDDDDDD";
    const pageId = "AAAAAAAAAAAAAAAAAAAAAAAAAA";
    await seedTestNode(fixture, {
      id: databaseId,
      properties: typeTableMarkerProperties("Features"),
    });
    await seedTestNode(fixture, {
      id: pageId,
      properties: { title: "Feature A" },
    });
    await seedTestRelationships(fixture, [
      { source: pageId, target: databaseId, type: "member_of", properties: { priority: "Low" } },
    ]);

    expect(
      await updateDatabaseRowProperty(fixture.ctx, databaseId, pageId, "priority", "High"),
    ).toBeNull();

    const edge = (await fixture.ctx.cache.listRelationshipsFromSource(pageId, projectionTypeForEndpoint(TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID, 1)))[0];
    expect(edge?.properties.priority).toBe("High");
  });

  test("coerces empty priority to Low", async () => {
    const pageId = "AAAAAAAAAAAAAAAAAAAAAAAAAA";
    const targetId = "BBBBBBBBBBBBBBBBBBBBBBBBBB";
    await seedTestNode(fixture, { id: pageId, properties: { title: "A" } });
    await seedTestNode(fixture, { id: targetId, properties: { title: "B" } });
    await seedTestCompositeRelationships(fixture, [
      {
        a: pageId,
        b: targetId,
        typeFromA: "Related",
        typeFromB: "Related",
        relationshipTypeId: TEST_RELATED_ASSOCIATION_ID,
        properties: { priority: "High" },
      },
    ]);

    expect(
      await updateOutgoingRelationshipProperty(fixture.ctx, pageId, targetId, RELATED_TYPE, "priority", ""),
    ).toBeNull();
    const edge = (await fixture.ctx.cache.listRelationshipsFromSource(pageId, RELATED_TYPE))[0];
    expect(edge?.properties.priority).toBe("Low");
  });

  test("rejects invalid priority values", async () => {
    const pageId = "CCCCCCCCCCCCCCCCCCCCCCCCCC";
    const targetId = "EEEEEEEEEEEEEEEEEEEEEEEEEE";
    await seedTestNode(fixture, { id: pageId, properties: { title: "A" } });
    await seedTestNode(fixture, { id: targetId, properties: { title: "B" } });
    await seedTestCompositeRelationships(fixture, [
      {
        a: pageId,
        b: targetId,
        typeFromA: "Related",
        typeFromB: "Related",
        relationshipTypeId: TEST_RELATED_ASSOCIATION_ID,
        properties: {},
      },
    ]);

    expect(
      await updateOutgoingRelationshipProperty(fixture.ctx, pageId, targetId, RELATED_TYPE, "priority", "4"),
    ).toBe("invalid_value");
  });

  afterAll(async () => {
    await destroyTestContentFixture(fixture);
  });
});
