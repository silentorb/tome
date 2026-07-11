import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
  seedTestRelationships,
  type TestContentFixture,
} from "tome-db/content/test-helpers";
import { createExtensionGraphQueryServices } from "../src/extension-graph-query";

describe("createExtensionGraphQueryServices", () => {
  let fixture: TestContentFixture;
  const typeId = "0000000000000000000000002K";
  const cityA = "0000000000000000000000001C";
  const cityB = "0000000000000000000000001X";
  const house = "00000000000000000000000029";

  beforeAll(() => {
    fixture = createTestContentFixture("tome-ext-graph-query-");
    seedTestNode(fixture, { id: typeId, properties: { title: "Locations" } });
    seedTestNode(fixture, { id: cityA, properties: { title: "City A" } });
    seedTestNode(fixture, { id: cityB, properties: { title: "City B" } });
    seedTestNode(fixture, { id: house, properties: { title: "House" } });
    seedTestRelationships(fixture, [
      { source: house, target: typeId, type: "member_of" },
      { source: cityA, target: typeId, type: "member_of" },
      { source: cityB, target: typeId, type: "member_of" },
      { source: house, target: cityA, type: "parents" },
      { source: house, target: cityB, type: "parents" },
      { source: cityA, target: cityB, type: "neighbor" },
    ]);
  });

  afterAll(() => {
    destroyTestContentFixture(fixture);
  });

  test("listTypeMembers returns is_a instances", () => {
    const services = createExtensionGraphQueryServices(
      fixture.ctx.db,
      fixture.ctx.store.contentDir,
    );
    const members = services.listTypeMembers(typeId);
    expect(members.map((node) => node.id).sort()).toEqual([cityA, cityB, house].sort());
    expect(members.find((node) => node.id === house)?.title).toBe("House");
  });

  test("listEdges filters by node set and types", () => {
    const services = createExtensionGraphQueryServices(
      fixture.ctx.db,
      fixture.ctx.store.contentDir,
    );
    const nodeIds = [cityA, cityB, house];
    const edges = services.listEdges({
      nodeIds,
      types: ["parents", "neighbor"],
    });
    const types = edges.map((edge) => edge.type).sort();
    expect(types).toEqual(["neighbor", "parents", "parents"]);
  });
});
