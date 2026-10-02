import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
  type TestContentFixture,
} from "tome-db/content/test-helpers";
import { registerBidirectionalType, invalidateRelationshipTypesCache } from "tome-flatfile";
import { createExtensionGraphMutateServices } from "../src/extension-graph-mutate";

describe("createExtensionGraphMutateServices", async () => {
  const fixture: TestContentFixture = await createTestContentFixture("tome-ext-graph-mutate-");
  const sourceId = "0000000000000000000000001C";
  const targetId = "0000000000000000000000001X";
  let assoc = "";

  beforeAll(async () => {
    const registry = fixture.ctx.store.readRelationshipTypesFile();
    assoc = registerBidirectionalType(registry, "Dependents", "Dependencies");
    fixture.ctx.store.writeRelationshipTypesFile(registry);
    invalidateRelationshipTypesCache();
    await seedTestNode(fixture, { id: sourceId, properties: { title: "A" } });
    await seedTestNode(fixture, { id: targetId, properties: { title: "B" } });
  });

  afterAll(async () => {
    await destroyTestContentFixture(fixture);
  });

  test("links and unlinks outgoing edges", async () => {
    const services = createExtensionGraphMutateServices(fixture.ctx);
    expect(
      await services.linkOutgoing({ sourceId, targetId, type: assoc }),
    ).toBeNull();
    expect(fixture.ctx.store.findRelationship(sourceId, targetId, assoc)).toBeTruthy();
    expect(await services.unlinkOutgoing(sourceId, targetId, assoc)).toBeNull();
    expect(fixture.ctx.store.findRelationship(sourceId, targetId, assoc)).toBeNull();
  });

  test("stores and replaces relationship properties", async () => {
    const services = createExtensionGraphMutateServices(fixture.ctx);
    expect(
      await services.linkOutgoing({
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
      await services.replaceOutgoingProperties(sourceId, targetId, assoc, {
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
    expect(await services.unlinkOutgoing(sourceId, targetId, assoc)).toBeNull();
  });
});
