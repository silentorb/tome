import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { writeFileSync } from "node:fs";
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
import { associationsFilePath } from "tome-flatfile";
import {
  registerBidirectionalType,
  serializeAssociationsFile,
} from "tome-flatfile";
import { invalidateAssociationsCache } from "tome-flatfile";

describe("relationship-link-mutations", () => {
  const fixture = createTestContentFixture("tome-link-");
  const ctx = fixture.ctx;

  const sourceId = "0000000000000000000000001C";
  const targetId = "0000000000000000000000001X";
  const databaseId = "0000000000000000000000002K";

  beforeAll(() => {
    const registry = fixture.ctx.store.readAssociationsFile();
    registerBidirectionalType(registry, "parents", "children");
    registerBidirectionalType(registry, "features", "targets");
    registerBidirectionalType(registry, "scenes", "rows");
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
        type: "parents",
      }),
    ).toBeNull();

    const edge = ctx.store.findRelationship(sourceId, targetId, "parents");
    expect(edge?.properties.via_database).toBeUndefined();

    expect(unlinkOutgoingRelationship(ctx, sourceId, targetId, "parents")).toBeNull();
    expect(ctx.store.findRelationship(sourceId, targetId, "parents")).toBeNull();
  });

  test("rejects duplicate links", () => {
    const source2 = "0000000000000000000000001E";
    const target2 = "00000000000000000000000021";
    seedTestNode(fixture, { id: source2, properties: { title: "Source 2" } });
    seedTestNode(fixture, { id: target2, properties: { title: "Target 2" } });

    linkOutgoingRelationship(ctx, { sourceId: source2, targetId: target2, type: "features" });
    expect(
      linkOutgoingRelationship(ctx, { sourceId: source2, targetId: target2, type: "features" }),
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
    const source3 = "0000000000000000000000001F";
    const target3a = "0000000000000000000000001Z";
    const target3b = "00000000000000000000000020";
    seedTestNode(fixture, { id: source3, properties: { title: "Source 3" } });
    seedTestNode(fixture, { id: target3a, properties: { title: "Target 3a" } });
    seedTestNode(fixture, { id: target3b, properties: { title: "Target 3b" } });

    linkOutgoingRelationship(ctx, {
      sourceId: source3,
      targetId: target3a,
      type: "features",
      properties: { ordinal: 1 },
    });
    linkOutgoingRelationship(ctx, {
      sourceId: source3,
      targetId: target3b,
      type: "features",
      properties: { ordinal: 7 },
    });

    const edge = ctx.store.findRelationship(source3, target3b, "features");
    expect(edge?.properties.ordinal).toBe(7);
  });

  afterAll(() => {
    destroyTestContentFixture(fixture);
  });
});
