import { describe, expect, test, afterAll } from "bun:test";
import { typeTableMarkerProperties } from "../src/node-capabilities";
import {
  linkOutgoingRelationship,
  moveRelationshipConnection,
  unlinkOutgoingRelationship,
} from "../src/relationship-link-mutations";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
} from "../src/content/test-helpers";

describe("relationship-link-mutations", () => {
  const fixture = createTestContentFixture("tome-link-");
  const ctx = fixture.ctx;

  const sourceId = "a1111111111111111111111111111111";
  const targetId = "b2222222222222222222222222222222";
  const databaseId = "d1111111111111111111111111111111";

  test("links and unlinks without via_database property", () => {
    seedTestNode(fixture, { id: sourceId, properties: { title: "Source" } });
    seedTestNode(fixture, { id: targetId, properties: { title: "Target" } });
    seedTestNode(fixture, {
      id: databaseId,
      properties: typeTableMarkerProperties("Features"),
    });

    expect(
      linkOutgoingRelationship(ctx, {
        sourceId,
        targetId,
        type: "parents",
      }),
    ).toBeNull();

    const edge = ctx.store.findRelationship(sourceId, targetId, "parents");
    expect(edge?.properties.via_database).toBeUndefined();

    expect(unlinkOutgoingRelationship(ctx, sourceId, targetId, "parents")).toBeNull();
    expect(ctx.store.findRelationship(sourceId, targetId, "parents")).toBeNull();
  });

  test("rejects duplicate links", () => {
    const source2 = "a2222222222222222222222222222222";
    const target2 = "b3333333333333333333333333333333";
    seedTestNode(fixture, { id: source2, properties: { title: "Source 2" } });
    seedTestNode(fixture, { id: target2, properties: { title: "Target 2" } });

    linkOutgoingRelationship(ctx, { sourceId: source2, targetId: target2, type: "features" });
    expect(
      linkOutgoingRelationship(ctx, { sourceId: source2, targetId: target2, type: "features" }),
    ).toBe("duplicate");
  });

  test("moveRelationshipConnection preserves properties and retargets edge", () => {
    const pageId = "a4444444444444444444444444444444";
    const rowId = "b4444444444444444444444444444444";
    const newPageId = "c4444444444444444444444444444444";
    seedTestNode(fixture, { id: pageId, properties: { title: "Page A" } });
    seedTestNode(fixture, { id: rowId, properties: { title: "Row" } });
    seedTestNode(fixture, { id: newPageId, properties: { title: "Page B" } });

    linkOutgoingRelationship(ctx, {
      sourceId: pageId,
      targetId: rowId,
      type: "scenes",
      properties: { ordinal: 3, priority: "High" },
    });

    expect(
      moveRelationshipConnection(ctx, {
        type: "scenes",
        oldSourceId: pageId,
        oldTargetId: rowId,
        newSourceId: newPageId,
        newTargetId: rowId,
      }),
    ).toBeNull();

    expect(ctx.store.findRelationship(pageId, rowId, "scenes")).toBeNull();
    const moved = ctx.store.findRelationship(newPageId, rowId, "scenes");
    expect(moved?.properties.ordinal).toBe(3);
    expect(moved?.properties.priority).toBe("High");
  });

  test("linkOutgoingRelationship preserves explicit ordinal in properties", () => {
    const source3 = "a3333333333333331111111111111111";
    const target3a = "b3333333333333331111111111111111";
    const target3b = "b3333333333333332222222222222222";
    seedTestNode(fixture, { id: source3, properties: { title: "Source 3" } });
    seedTestNode(fixture, { id: target3a, properties: { title: "Target 3a" } });
    seedTestNode(fixture, { id: target3b, properties: { title: "Target 3b" } });

    linkOutgoingRelationship(ctx, {
      sourceId: source3,
      targetId: target3a,
      type: "items",
      properties: { ordinal: 1 },
    });
    linkOutgoingRelationship(ctx, {
      sourceId: source3,
      targetId: target3b,
      type: "items",
      properties: { ordinal: 7 },
    });

    const edge = ctx.store.findRelationship(source3, target3b, "items");
    expect(edge?.properties.ordinal).toBe(7);
  });

  afterAll(() => {
    destroyTestContentFixture(fixture);
  });
});
