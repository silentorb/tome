import { describe, expect, test, afterAll } from "bun:test";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
  seedTestRelationships,
} from "../src/content/test-helpers";

describe("listDistinctRelationshipTypes", () => {
  const fixture = createTestContentFixture("tome-distinct-types-");
  const nodeA = "0000000000000000000000001C";
  const nodeB = "0000000000000000000000001W";
  const nodeC = "00000000000000000000000028";

  seedTestNode(fixture, { id: nodeA, properties: { title: "A" } });
  seedTestNode(fixture, { id: nodeB, properties: { title: "B" } });
  seedTestNode(fixture, { id: nodeC, properties: { title: "C" } });
  seedTestRelationships(fixture, [
    { source: nodeA, target: nodeB, type: "features" },
    { source: nodeA, target: nodeC, type: "inspirations" },
    { source: nodeB, target: nodeC, type: "features" },
  ]);

  test("returns sorted unique projection types", () => {
    const types = fixture.ctx.db.listDistinctRelationshipTypes();
    expect(types).toEqual(["features", "inspirations"]);
  });

  afterAll(() => {
    destroyTestContentFixture(fixture);
  });
});
