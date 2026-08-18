import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
  type TestContentFixture,
} from "tome-db/content/test-helpers";
import { registerBidirectionalType, invalidateAssociationsCache } from "tome-flatfile";
import { createExtensionGraphMutateServices } from "../src/extension-graph-mutate";

describe("createExtensionGraphMutateServices", () => {
  const fixture: TestContentFixture = createTestContentFixture("tome-ext-graph-mutate-");
  const sourceId = "0000000000000000000000001C";
  const targetId = "0000000000000000000000001X";
  let assoc = "";

  beforeAll(() => {
    const registry = fixture.ctx.store.readAssociationsFile();
    assoc = registerBidirectionalType(registry, "Dependents", "Dependencies");
    fixture.ctx.store.writeAssociationsFile(registry);
    invalidateAssociationsCache();
    seedTestNode(fixture, { id: sourceId, properties: { title: "A" } });
    seedTestNode(fixture, { id: targetId, properties: { title: "B" } });
  });

  afterAll(() => {
    destroyTestContentFixture(fixture);
  });

  test("links and unlinks outgoing edges", () => {
    const services = createExtensionGraphMutateServices(fixture.ctx);
    expect(
      services.linkOutgoing({ sourceId, targetId, type: assoc }),
    ).toBeNull();
    expect(fixture.ctx.store.findRelationship(sourceId, targetId, assoc)).toBeTruthy();
    expect(services.unlinkOutgoing(sourceId, targetId, assoc)).toBeNull();
    expect(fixture.ctx.store.findRelationship(sourceId, targetId, assoc)).toBeNull();
  });

  test("stores and replaces relationship properties", () => {
    const services = createExtensionGraphMutateServices(fixture.ctx);
    expect(
      services.linkOutgoing({
        sourceId,
        targetId,
        type: assoc,
        properties: {
          endpoints: [{ from: "end", to: "start" }],
        },
      }),
    ).toBeNull();
    const created = fixture.ctx.store.findRelationship(sourceId, targetId, assoc);
    expect(created?.properties.endpoints).toEqual([{ from: "end", to: "start" }]);

    expect(
      services.replaceOutgoingProperties(sourceId, targetId, assoc, {
        endpoints: [
          { from: "end", to: "start" },
          { from: "start", to: "start" },
        ],
      }),
    ).toBeNull();
    const replaced = fixture.ctx.store.findRelationship(sourceId, targetId, assoc);
    expect(replaced?.properties.endpoints).toEqual([
      { from: "end", to: "start" },
      { from: "start", to: "start" },
    ]);
    expect(services.unlinkOutgoing(sourceId, targetId, assoc)).toBeNull();
  });
});
