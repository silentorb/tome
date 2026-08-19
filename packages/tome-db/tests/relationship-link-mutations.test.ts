import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { typeTableMarkerProperties } from "../src/node-capabilities";
import {
  linkOutgoingRelationship,
  moveRelationshipConnection,
  unlinkOutgoingRelationship,
} from "../src/relationship-link-mutations";
import { getDatabaseViewDetail } from "../src/database-view";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
  seedTestTableSchema,
  TEST_MEMBER_OF_ASSOCIATION_ID,
  TEST_ORDERED_MEMBER_OF_ASSOCIATION_ID,
} from "../src/content/test-helpers";
import {
  projectionTypeForEndpoint,
  registerBidirectionalType,
} from "tome-flatfile";
import { invalidateAssociationsCache } from "tome-flatfile";

describe("relationship-link-mutations", () => {
  const fixture = createTestContentFixture("tome-link-");
  const ctx = fixture.ctx;

  const sourceId = "0000000000000000000000001C";
  const targetId = "0000000000000000000000001X";
  const databaseId = "0000000000000000000000002K";

  let parentsAssoc = "";
  let featuresAssoc = "";
  let pageRowsAssoc = "";

  beforeAll(() => {
    const registry = fixture.ctx.store.readAssociationsFile();
    parentsAssoc = registerBidirectionalType(registry, "Parents", "Children");
    featuresAssoc = registerBidirectionalType(registry, "Features", "Targets");
    pageRowsAssoc = registerBidirectionalType(registry, "Page rows", "Row pages");
    fixture.ctx.store.writeAssociationsFile(registry);
    invalidateAssociationsCache();
  });

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
        type: parentsAssoc,
      }),
    ).toBeNull();

    const edge = ctx.store.findRelationship(sourceId, targetId, parentsAssoc);
    expect(edge?.properties.via_database).toBeUndefined();

    expect(unlinkOutgoingRelationship(ctx, sourceId, targetId, parentsAssoc)).toBeNull();
    expect(ctx.store.findRelationship(sourceId, targetId, parentsAssoc)).toBeNull();
  });

  test("rejects duplicate links", () => {
    const source2 = "0000000000000000000000001E";
    const target2 = "00000000000000000000000021";
    seedTestNode(fixture, { id: source2, properties: { title: "Source 2" } });
    seedTestNode(fixture, { id: target2, properties: { title: "Target 2" } });

    linkOutgoingRelationship(ctx, { sourceId: source2, targetId: target2, type: featuresAssoc });
    expect(
      linkOutgoingRelationship(ctx, { sourceId: source2, targetId: target2, type: featuresAssoc }),
    ).toBe("duplicate");
  });

  test("moveRelationshipConnection preserves properties and retargets edge", () => {
    const pageId = "0000000000000000000000001H";
    const rowId = "00000000000000000000000022";
    const newPageId = "0000000000000000000000002B";
    seedTestNode(fixture, { id: pageId, properties: { title: "Page A" } });
    seedTestNode(fixture, { id: rowId, properties: { title: "Row" } });
    seedTestNode(fixture, { id: newPageId, properties: { title: "Page B" } });

    linkOutgoingRelationship(ctx, {
      sourceId: pageId,
      targetId: rowId,
      type: pageRowsAssoc,
      properties: { ordinal: 3, priority: "High" },
    });

    expect(
      moveRelationshipConnection(ctx, {
        type: pageRowsAssoc,
        oldSourceId: pageId,
        oldTargetId: rowId,
        newSourceId: newPageId,
        newTargetId: rowId,
      }),
    ).toBeNull();

    expect(ctx.store.findRelationship(pageId, rowId, pageRowsAssoc)).toBeNull();
    const moved = ctx.store.findRelationship(newPageId, rowId, pageRowsAssoc);
    expect(moved?.properties.ordinal).toBe(3);
    expect(moved?.properties.priority).toBe("High");
  });

  test("linkOutgoingRelationship preserves explicit ordinal in properties", () => {
    const source3 = "0000000000000000000000001F";
    const target3a = "0000000000000000000000001Z";
    const target3b = "00000000000000000000000020";
    seedTestNode(fixture, { id: source3, properties: { title: "Source 3" } });
    seedTestNode(fixture, { id: target3a, properties: { title: "Target 3a" } });
    seedTestNode(fixture, { id: target3b, properties: { title: "Target 3b" } });

    linkOutgoingRelationship(ctx, {
      sourceId: source3,
      targetId: target3a,
      type: featuresAssoc,
      properties: { ordinal: 1 },
    });
    linkOutgoingRelationship(ctx, {
      sourceId: source3,
      targetId: target3b,
      type: featuresAssoc,
      properties: { ordinal: 7 },
    });

    const edge = ctx.store.findRelationship(source3, target3b, featuresAssoc);
    expect(edge?.properties.ordinal).toBe(7);
  });

  test("unlinks a Members row when the stored edge uses a different set association", () => {
    const setId = "0000000000000000000000003A";
    const memberId = "0000000000000000000000003B";
    seedTestNode(fixture, {
      id: setId,
      properties: typeTableMarkerProperties("Arcs"),
    });
    seedTestTableSchema(fixture, setId, []);
    seedTestNode(fixture, { id: memberId, properties: { title: "Adelle as a Barista" } });

    const orderedMemberSide = projectionTypeForEndpoint(TEST_ORDERED_MEMBER_OF_ASSOCIATION_ID, 1);
    expect(
      linkOutgoingRelationship(ctx, {
        sourceId: memberId,
        targetId: setId,
        type: orderedMemberSide,
      }),
    ).toBeNull();

    const view = getDatabaseViewDetail(ctx.cache, setId, undefined, ctx.store.contentDir);
    expect(view?.rows.some((row) => row.nodeId === memberId)).toBe(true);
    expect(view?.memberSidePerspective).toBe(
      projectionTypeForEndpoint(TEST_MEMBER_OF_ASSOCIATION_ID, 1),
    );

    expect(
      unlinkOutgoingRelationship(ctx, memberId, setId, view!.memberSidePerspective),
    ).toBeNull();
    expect(
      ctx.store.findRelationship(memberId, setId, TEST_ORDERED_MEMBER_OF_ASSOCIATION_ID),
    ).toBeNull();
  });

  test("unlinks an inverted set-side edge shown as a Members row on the instance", () => {
    const instanceId = "0000000000000000000000003C";
    const typeTableId = "0000000000000000000000003D";
    seedTestNode(fixture, { id: instanceId, properties: { title: "Adelle as a Barista" } });
    seedTestNode(fixture, {
      id: typeTableId,
      properties: typeTableMarkerProperties("Arcs"),
    });
    seedTestTableSchema(fixture, typeTableId, []);

    const orderedSetSide = projectionTypeForEndpoint(TEST_ORDERED_MEMBER_OF_ASSOCIATION_ID, 0);
    expect(
      linkOutgoingRelationship(ctx, {
        sourceId: instanceId,
        targetId: typeTableId,
        type: orderedSetSide,
      }),
    ).toBeNull();

    const view = getDatabaseViewDetail(ctx.cache, instanceId, undefined, ctx.store.contentDir);
    expect(view?.rows.some((row) => row.nodeId === typeTableId)).toBe(true);

    expect(
      unlinkOutgoingRelationship(ctx, typeTableId, instanceId, view!.memberSidePerspective),
    ).toBeNull();
    expect(
      ctx.store.findRelationship(instanceId, typeTableId, TEST_ORDERED_MEMBER_OF_ASSOCIATION_ID),
    ).toBeNull();
  });

  afterAll(() => {
    destroyTestContentFixture(fixture);
  });
});
