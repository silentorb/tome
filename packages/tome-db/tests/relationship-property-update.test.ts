import { describe, expect, test, afterAll } from "bun:test";
import { IS_A_TYPE } from "../src/labels";
import { typeTableMarkerProperties } from "../src/node-capabilities";
import { updateDatabaseRowProperty, updateOutgoingRelationshipProperty } from "../src/relationship-property-update";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestRelationships,
  seedTestNode,
} from "../src/content/test-helpers";

describe("relationship-property-update", () => {
  const fixture = createTestContentFixture("tome-db-conn-prop-");

  test("updates priority on database membership edge", () => {
    const databaseId = "dddddddddddddddddddddddddddddddd";
    const pageId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    seedTestNode(fixture, {
      id: databaseId,
      properties: typeTableMarkerProperties("Features"),
    });
    seedTestNode(fixture, {
      id: pageId,
      properties: { title: "Feature A" },
    });
    seedTestRelationships(fixture, [
      { source: pageId, target: databaseId, type: IS_A_TYPE, properties: { priority: "Low" } },
    ]);

    expect(
      updateDatabaseRowProperty(fixture.ctx, databaseId, pageId, "priority", "High"),
    ).toBeNull();

    const edge = fixture.ctx.db.listRelationshipsFromSource(pageId, IS_A_TYPE)[0];
    expect(edge?.properties.priority).toBe("High");
  });

  test("coerces empty priority to Low", () => {
    const pageId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const targetId = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    seedTestNode(fixture, { id: pageId, properties: { title: "A" } });
    seedTestNode(fixture, { id: targetId, properties: { title: "B" } });
    seedTestRelationships(fixture, [
      { source: pageId, target: targetId, type: "related", properties: { priority: "High" } },
    ]);

    expect(
      updateOutgoingRelationshipProperty(fixture.ctx, pageId, targetId, "related", "priority", ""),
    ).toBeNull();
    const edge = fixture.ctx.db.listRelationshipsFromSource(pageId, "related")[0];
    expect(edge?.properties.priority).toBe("Low");
  });

  test("rejects invalid priority values", () => {
    const pageId = "cccccccccccccccccccccccccccccccc";
    const targetId = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
    seedTestNode(fixture, { id: pageId, properties: { title: "A" } });
    seedTestNode(fixture, { id: targetId, properties: { title: "B" } });
    seedTestRelationships(fixture, [{ source: pageId, target: targetId, type: "related", properties: {} }]);

    expect(
      updateOutgoingRelationshipProperty(fixture.ctx, pageId, targetId, "related", "priority", "4"),
    ).toBe("invalid_value");
  });

  afterAll(() => {
    destroyTestContentFixture(fixture);
  });
});
