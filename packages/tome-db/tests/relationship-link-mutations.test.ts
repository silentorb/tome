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
  TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID,
  TEST_ORDERED_MEMBER_OF_RELATIONSHIP_TYPE_ID,
} from "../src/content/test-helpers";
import {
  projectionTypeForEndpoint,
  registerBidirectionalType,
} from "tome-flatfile";
import { invalidateRelationshipTypesCache } from "tome-flatfile";

describe("relationship-link-mutations", async () => {
  const fixture = await createTestContentFixture("tome-link-");
  const ctx = fixture.ctx;

  const sourceId = "0000000000000000000000001C";
  const targetId = "0000000000000000000000001X";
  const databaseId = "0000000000000000000000002K";

  let parentsAssoc = "";
  let featuresAssoc = "";
  let pageRowsAssoc = "";

  beforeAll(() => {
    const registry = fixture.ctx.store.readRelationshipTypesFile();
    parentsAssoc = registerBidirectionalType(registry, "Parents", "Children");
    featuresAssoc = registerBidirectionalType(registry, "Features", "Targets");
    pageRowsAssoc = registerBidirectionalType(registry, "Page rows", "Row pages");
    fixture.ctx.store.writeRelationshipTypesFile(registry);
    invalidateRelationshipTypesCache();
  });

  test("links and unlinks without via_database property", async () => {
    await seedTestNode(fixture, { id: sourceId, properties: { title: "Source" } });
    await seedTestNode(fixture, { id: targetId, properties: { title: "Target" } });
    await seedTestNode(fixture, {
      id: databaseId,
      properties: typeTableMarkerProperties("Features"),
    });

    expect(
      await linkOutgoingRelationship(ctx, {
        sourceId,
        targetId,
        type: parentsAssoc,
      }),
    ).toBeNull();

    const edge = ctx.store.findRelationship(sourceId, targetId, parentsAssoc);
    expect(edge?.properties.via_database).toBeUndefined();

    expect(await unlinkOutgoingRelationship(ctx, sourceId, targetId, parentsAssoc)).toBeNull();
    expect(ctx.store.findRelationship(sourceId, targetId, parentsAssoc)).toBeNull();
  });

  test("rejects duplicate links", async () => {
    const source2 = "0000000000000000000000001E";
    const target2 = "00000000000000000000000021";
    await seedTestNode(fixture, { id: source2, properties: { title: "Source 2" } });
    await seedTestNode(fixture, { id: target2, properties: { title: "Target 2" } });

    await linkOutgoingRelationship(ctx, { sourceId: source2, targetId: target2, type: featuresAssoc });
    expect(
      await linkOutgoingRelationship(ctx, { sourceId: source2, targetId: target2, type: featuresAssoc }),
    ).toBe("duplicate");
  });

  test("moveRelationshipConnection preserves properties and retargets edge", async () => {
    const pageId = "0000000000000000000000001H";
    const rowId = "00000000000000000000000022";
    const newPageId = "0000000000000000000000002B";
    await seedTestNode(fixture, { id: pageId, properties: { title: "Page A" } });
    await seedTestNode(fixture, { id: rowId, properties: { title: "Row" } });
    await seedTestNode(fixture, { id: newPageId, properties: { title: "Page B" } });

    await linkOutgoingRelationship(ctx, {
      sourceId: pageId,
      targetId: rowId,
      type: pageRowsAssoc,
      properties: { ordinal: 3, priority: "High" },
    });

    expect(
      await moveRelationshipConnection(ctx, {
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

  test("linkOutgoingRelationship preserves explicit ordinal in properties", async () => {
    const source3 = "0000000000000000000000001F";
    const target3a = "0000000000000000000000001Z";
    const target3b = "00000000000000000000000020";
    await seedTestNode(fixture, { id: source3, properties: { title: "Source 3" } });
    await seedTestNode(fixture, { id: target3a, properties: { title: "Target 3a" } });
    await seedTestNode(fixture, { id: target3b, properties: { title: "Target 3b" } });

    await linkOutgoingRelationship(ctx, {
      sourceId: source3,
      targetId: target3a,
      type: featuresAssoc,
      properties: { ordinal: 1 },
    });
    await linkOutgoingRelationship(ctx, {
      sourceId: source3,
      targetId: target3b,
      type: featuresAssoc,
      properties: { ordinal: 7 },
    });

    const edge = ctx.store.findRelationship(source3, target3b, featuresAssoc);
    expect(edge?.properties.ordinal).toBe(7);
  });

  test("unlinks a Members row when the stored edge uses a different set relationship type", async () => {
    const setId = "0000000000000000000000003A";
    const memberId = "0000000000000000000000003B";
    await seedTestNode(fixture, {
      id: setId,
      properties: typeTableMarkerProperties("Arcs"),
    });
    seedTestTableSchema(fixture, setId, []);
    await seedTestNode(fixture, { id: memberId, properties: { title: "Adelle as a Barista" } });

    const orderedMemberSide = projectionTypeForEndpoint(TEST_ORDERED_MEMBER_OF_RELATIONSHIP_TYPE_ID, 1);
    expect(
      await linkOutgoingRelationship(ctx, {
        sourceId: memberId,
        targetId: setId,
        type: orderedMemberSide,
      }),
    ).toBeNull();

    const view = await getDatabaseViewDetail(ctx.cache, setId, undefined, ctx.store.contentDir);
    expect(view?.rows.some((row) => row.nodeId === memberId)).toBe(true);
    expect(view?.memberSidePerspective).toBe(
      projectionTypeForEndpoint(TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID, 1),
    );

    expect(
      await unlinkOutgoingRelationship(ctx, memberId, setId, view!.memberSidePerspective),
    ).toBeNull();
    expect(
      ctx.store.findRelationship(memberId, setId, TEST_ORDERED_MEMBER_OF_RELATIONSHIP_TYPE_ID),
    ).toBeNull();
  });

  test("unlinks an inverted set-side edge shown as a Members row on the instance", async () => {
    const instanceId = "0000000000000000000000003C";
    const typeTableId = "0000000000000000000000003D";
    await seedTestNode(fixture, { id: instanceId, properties: { title: "Adelle as a Barista" } });
    await seedTestNode(fixture, {
      id: typeTableId,
      properties: typeTableMarkerProperties("Arcs"),
    });
    seedTestTableSchema(fixture, typeTableId, []);

    const orderedSetSide = projectionTypeForEndpoint(TEST_ORDERED_MEMBER_OF_RELATIONSHIP_TYPE_ID, 0);
    expect(
      await linkOutgoingRelationship(ctx, {
        sourceId: instanceId,
        targetId: typeTableId,
        type: orderedSetSide,
      }),
    ).toBeNull();

    const view = await getDatabaseViewDetail(ctx.cache, instanceId, undefined, ctx.store.contentDir);
    expect(view?.rows.some((row) => row.nodeId === typeTableId)).toBe(true);

    expect(
      await unlinkOutgoingRelationship(ctx, typeTableId, instanceId, view!.memberSidePerspective),
    ).toBeNull();
    expect(
      ctx.store.findRelationship(instanceId, typeTableId, TEST_ORDERED_MEMBER_OF_RELATIONSHIP_TYPE_ID),
    ).toBeNull();
  });

  afterAll(async () => {
    await destroyTestContentFixture(fixture);
  });
});
