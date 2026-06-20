import { describe, expect, test, afterAll } from "bun:test";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
} from "../src/content/test-helpers";
import { typeTableMarkerProperties } from "../src/node-capabilities";
import { IS_A_TYPE } from "../src/labels";
import {
  filterRelationshipsByRowDatabaseContext,
  firstRelatedNodeId,
  listRelationshipsForComposite,
  listRelationshipsToDatabaseMembers,
  relatedNodeIds,
  rowBelongsToDatabase,
} from "../src/relationship-traverse";
import type { RelationshipEntry } from "../src/content/relationships-file";
import { RELATIONSHIPS_FILE_VERSION, sortEndpoints } from "../src/content/relationships-file";

describe("relationship-traverse", () => {
  const fixture = createTestContentFixture("tome-rel-traverse-");
  const scene = "11111111111111111111111111111111";
  const product = "22222222222222222222222222222222";
  const part = "33333333333333333333333333333333";
  const location = "44444444444444444444444444444444";
  const scenesDb = "55555555555555555555555555555555";
  const locationsDb = "66666666666666666666666666666666";

  seedTestNode(fixture, { id: scenesDb, properties: typeTableMarkerProperties("Scenes") });
  seedTestNode(fixture, { id: locationsDb, properties: typeTableMarkerProperties("Locations") });
  seedTestNode(fixture, { id: scene, properties: { title: "Scene" } });
  seedTestNode(fixture, { id: product, properties: { title: "Product" } });
  seedTestNode(fixture, { id: part, properties: { title: "Part" } });
  seedTestNode(fixture, { id: location, properties: { title: "Location" } });
  fixture.ctx.store.writeRelationshipTypesFile({
    version: 1,
    types: {
      scenes_product: { bidirectional: true, perspectives: ["scenes", "product"] },
      scenes_part: { bidirectional: true, perspectives: ["scenes", "part"] },
      scenes_location: { bidirectional: true, perspectives: ["location", "scenes"] },
    },
  });

  const relationships: RelationshipEntry[] = [
    { a: scene, b: product, type: "scenes_product", properties: { ordinal: 0 } },
    { a: scene, b: part, type: "scenes_part", properties: { ordinal: 0 } },
    {
      a: scene,
      b: location,
      type: "scenes_location",
      properties: { ordinal: 0 },
    },
    { a: scene, b: scenesDb, type: IS_A_TYPE, properties: { row_index: 0 } },
    { a: location, b: locationsDb, type: IS_A_TYPE, properties: { row_index: 0 } },
  ];
  for (const entry of relationships) {
    const sorted = sortEndpoints(entry.a, entry.b);
    entry.a = sorted.a;
    entry.b = sorted.b;
    if (entry.type === IS_A_TYPE) {
      entry.directedFrom = entry.a === scene ? scene : location;
    }
  }
  fixture.ctx.store.writeRelationshipsFile({
    version: RELATIONSHIPS_FILE_VERSION,
    relationships,
  });
  fixture.ctx.sync.syncRelationships();

  test("finds product through scenes_product composite", () => {
    expect(firstRelatedNodeId(fixture.ctx.db, scene, "scenes_product")).toBe(product);
    expect(relatedNodeIds(fixture.ctx.db, scene, "scenes_product")).toEqual([product]);
  });

  test("finds part through scenes_part composite", () => {
    expect(firstRelatedNodeId(fixture.ctx.db, scene, "scenes_part")).toBe(part);
  });

  test("finds scene from location through scenes_location composite", () => {
    const rels = listRelationshipsForComposite(fixture.ctx.db, location, "scenes_location");
    expect(rels.some((rel) => rel.sourceNodeId === location || rel.targetNodeId === location)).toBe(
      true,
    );
    const members = listRelationshipsToDatabaseMembers(fixture.ctx.db, location, scenesDb);
    expect(members.some((rel) => otherEndpointFrom(location, rel) === scene)).toBe(true);
  });

  test("rowBelongsToDatabase reflects is_a membership", () => {
    expect(rowBelongsToDatabase(fixture.ctx.db, scene, scenesDb)).toBe(true);
    expect(rowBelongsToDatabase(fixture.ctx.db, scene, locationsDb)).toBe(false);
    expect(rowBelongsToDatabase(fixture.ctx.db, product, scenesDb)).toBe(false);
  });

  test("filterRelationshipsByRowDatabaseContext keeps edges for row members", () => {
    const rels = listRelationshipsToDatabaseMembers(fixture.ctx.db, location, scenesDb);
    const filtered = filterRelationshipsByRowDatabaseContext(
      fixture.ctx.db,
      location,
      locationsDb,
      rels,
    );
    expect(filtered).toHaveLength(1);
    expect(otherEndpointFrom(location, filtered[0]!)).toBe(scene);
  });

  test("filterRelationshipsByRowDatabaseContext returns empty when row is not a member", () => {
    const relationships = [
      {
        id: "1",
        recordId: "r1",
        sourceNodeId: location,
        targetNodeId: scene,
        type: "includes",
        properties: {},
      },
      {
        id: "2",
        recordId: "r2",
        sourceNodeId: location,
        targetNodeId: product,
        type: "includes",
        properties: {},
      },
    ];
    const filtered = filterRelationshipsByRowDatabaseContext(
      fixture.ctx.db,
      location,
      scenesDb,
      relationships,
    );
    expect(filtered).toHaveLength(0);
  });

  afterAll(() => {
    destroyTestContentFixture(fixture);
  });
});

function otherEndpointFrom(nodeId: string, relationship: { sourceNodeId: string; targetNodeId: string }) {
  return relationship.sourceNodeId === nodeId
    ? relationship.targetNodeId
    : relationship.sourceNodeId;
}
