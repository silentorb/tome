import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
  seedTestRelationships,
  seedTestCompositeRelationships,
  type TestContentFixture,
  TEST_PARENTS_CHILDREN_ASSOCIATION_ID,
} from "tome-db/content/test-helpers";
import { projectionTypeForEndpoint } from "tome-flatfile";
import { createExtensionGraphQueryServices } from "../src/extension-graph-query";

const NEIGHBOR_ASSOCIATION_ID = "000000000000000000000000C2";

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
    ]);
    seedTestCompositeRelationships(fixture, [
      {
        a: house,
        b: cityA,
        typeFromA: "Children",
        typeFromB: "Parents",
        associationId: TEST_PARENTS_CHILDREN_ASSOCIATION_ID,
      },
      {
        a: house,
        b: cityB,
        typeFromA: "Children",
        typeFromB: "Parents",
        associationId: TEST_PARENTS_CHILDREN_ASSOCIATION_ID,
      },
      {
        a: cityA,
        b: cityB,
        typeFromA: "Neighbor",
        typeFromB: "Neighbor",
        associationId: NEIGHBOR_ASSOCIATION_ID,
      },
    ]);
  });

  afterAll(() => {
    destroyTestContentFixture(fixture);
  });

  test("listTypeMembers returns is_a instances", () => {
    const services = createExtensionGraphQueryServices(
      fixture.ctx.cache,
      fixture.ctx.store.contentDir,
    );
    const members = services.listTypeMembers(typeId);
    expect(members.map((node) => node.id).sort()).toEqual([cityA, cityB, house].sort());
    expect(members.find((node) => node.id === house)?.title).toBe("House");
  });

  test("listEdges filters by node set and types", () => {
    const services = createExtensionGraphQueryServices(
      fixture.ctx.cache,
      fixture.ctx.store.contentDir,
    );
    const nodeIds = [cityA, cityB, house];
    const parents0 = projectionTypeForEndpoint(TEST_PARENTS_CHILDREN_ASSOCIATION_ID, 0);
    const parents1 = projectionTypeForEndpoint(TEST_PARENTS_CHILDREN_ASSOCIATION_ID, 1);
    const neighbor0 = projectionTypeForEndpoint(NEIGHBOR_ASSOCIATION_ID, 0);
    const neighbor1 = projectionTypeForEndpoint(NEIGHBOR_ASSOCIATION_ID, 1);
    const edges = services.listEdges({
      nodeIds,
      types: [parents0, parents1, neighbor0, neighbor1],
    });
    const types = edges.map((edge) => edge.type).sort();
    expect(types).toEqual(
      [neighbor0, neighbor1, parents0, parents0, parents1, parents1].sort(),
    );
  });
});
