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
  TEST_MEMBER_OF_ASSOCIATION_ID,
  TEST_RELATED_ASSOCIATION_ID,
} from "../src/content/test-helpers";

const RELATED_TYPE = projectionTypeForEndpoint(TEST_RELATED_ASSOCIATION_ID, 0);

describe("relationship-property-update", () => {
  const fixture = createTestContentFixture("tome-db-conn-prop-");

  test("updates priority on database membership edge", () => {
    const databaseId = "DDDDDDDDDDDDDDDDDDDDDDDDDD";
    const pageId = "AAAAAAAAAAAAAAAAAAAAAAAAAA";
    seedTestNode(fixture, {
      id: databaseId,
      properties: typeTableMarkerProperties("Features"),
    });
    seedTestNode(fixture, {
      id: pageId,
      properties: { title: "Feature A" },
    });
    seedTestRelationships(fixture, [
      { source: pageId, target: databaseId, type: "member_of", properties: { priority: "Low" } },
    ]);

    expect(
      updateDatabaseRowProperty(fixture.ctx, databaseId, pageId, "priority", "High"),
    ).toBeNull();

    const edge = fixture.ctx.cache.listRelationshipsFromSource(pageId, projectionTypeForEndpoint(TEST_MEMBER_OF_ASSOCIATION_ID, 1))[0];
    expect(edge?.properties.priority).toBe("High");
  });

  test("coerces empty priority to Low", () => {
    const pageId = "AAAAAAAAAAAAAAAAAAAAAAAAAA";
    const targetId = "BBBBBBBBBBBBBBBBBBBBBBBBBB";
    seedTestNode(fixture, { id: pageId, properties: { title: "A" } });
    seedTestNode(fixture, { id: targetId, properties: { title: "B" } });
    seedTestCompositeRelationships(fixture, [
      {
        a: pageId,
        b: targetId,
        typeFromA: "Related",
        typeFromB: "Related",
        associationId: TEST_RELATED_ASSOCIATION_ID,
        properties: { priority: "High" },
      },
    ]);

    expect(
      updateOutgoingRelationshipProperty(fixture.ctx, pageId, targetId, RELATED_TYPE, "priority", ""),
    ).toBeNull();
    const edge = fixture.ctx.cache.listRelationshipsFromSource(pageId, RELATED_TYPE)[0];
    expect(edge?.properties.priority).toBe("Low");
  });

  test("rejects invalid priority values", () => {
    const pageId = "CCCCCCCCCCCCCCCCCCCCCCCCCC";
    const targetId = "EEEEEEEEEEEEEEEEEEEEEEEEEE";
    seedTestNode(fixture, { id: pageId, properties: { title: "A" } });
    seedTestNode(fixture, { id: targetId, properties: { title: "B" } });
    seedTestCompositeRelationships(fixture, [
      {
        a: pageId,
        b: targetId,
        typeFromA: "Related",
        typeFromB: "Related",
        associationId: TEST_RELATED_ASSOCIATION_ID,
        properties: {},
      },
    ]);

    expect(
      updateOutgoingRelationshipProperty(fixture.ctx, pageId, targetId, RELATED_TYPE, "priority", "4"),
    ).toBe("invalid_value");
  });

  afterAll(() => {
    destroyTestContentFixture(fixture);
  });
});
