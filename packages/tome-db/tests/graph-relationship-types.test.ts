import { describe, expect, test, afterAll } from "bun:test";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
  seedTestRelationships,
} from "../src/content/test-helpers";

describe("listDistinctRelationshipTypes", () => {
  const fixture = createTestContentFixture("tome-distinct-types-");
  const nodeA = "a1111111111111111111111111111111";
  const nodeB = "b1111111111111111111111111111111";
  const nodeC = "c1111111111111111111111111111111";

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
