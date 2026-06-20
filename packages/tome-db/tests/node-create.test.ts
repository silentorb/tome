import { describe, expect, test, afterEach } from "bun:test";
import { IS_A_TYPE } from "../src/labels";
import { typeTableMarkerProperties } from "../src/node-capabilities";
import { getNodeDetail } from "../src/queries";
import { createNode } from "../src/node-create";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
  type TestContentFixture,
} from "../src/content/test-helpers";

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

    const detail = getNodeDetail(fixture.ctx.db, result.id);
    expect(detail?.title).toBe("New idea");
    expect(detail?.body).toBe("Notes here\n");
    expect(detail?.isTypeTable).toBe(false);
    expect(fixture.ctx.store.readNode(result.id)).not.toBeNull();
  });

  test("rejects empty title", () => {
    fixture = createTestContentFixture("tome-create-");
    expect(createNode(fixture.ctx, { title: "   " })).toBe("invalid_title");
  });

  test("creates outgoing relation row", () => {
    fixture = createTestContentFixture("tome-create-");
    const sourceId = "a1111111111111111111111111111111";
    seedTestNode(fixture, {
      id: sourceId,
      properties: { title: "Scene" },
    });
    seedTestNode(fixture, {
      id: "b1111111111111111111111111111111",
      properties: { title: "Existing feat" },
    });
    fixture.ctx.store.upsertRelationship(sourceId, "b1111111111111111111111111111111", "features", {
      ordinal: 2,
    });
    fixture.ctx.sync.syncRelationships();

    const result = createNode(fixture.ctx, {
      title: "New feature",
      link: { kind: "outgoing", sourceId, type: "features" },
    });
    if (typeof result === "string") throw new Error(result);

    const rel = fixture.ctx.store.findRelationship(sourceId, result.id, "features");
    expect(rel).not.toBeNull();
    expect(rel?.properties.ordinal).toBe(3);
  });

  test("creates database IS_A row", () => {
    fixture = createTestContentFixture("tome-create-");
    const databaseId = "c1111111111111111111111111111111";
    seedTestNode(fixture, {
      id: databaseId,
      properties: typeTableMarkerProperties("Features"),
    });
    seedTestNode(fixture, {
      id: "d1111111111111111111111111111111",
      properties: { title: "Old row" },
    });
    fixture.ctx.store.upsertRelationship("d1111111111111111111111111111111", databaseId, IS_A_TYPE, {
      row_index: 4,
      view: "default",
    });
    fixture.ctx.sync.syncRelationships();

    const result = createNode(fixture.ctx, {
      title: "Fresh row",
      link: { kind: "database-row", databaseId, view: "default" },
    });
    if (typeof result === "string") throw new Error(result);

    const rel = fixture.ctx.store.findRelationship(result.id, databaseId, IS_A_TYPE);
    expect(rel?.properties.row_index).toBe(5);
    expect(rel?.properties.view).toBe("default");
  });

  test("returns source_not_found for missing parent", () => {
    fixture = createTestContentFixture("tome-create-");
    expect(
      createNode(fixture.ctx, {
        title: "X",
        link: {
          kind: "outgoing",
          sourceId: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
          type: "features",
        },
      }),
    ).toBe("source_not_found");
  });
});
