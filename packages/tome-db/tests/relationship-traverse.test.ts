import { describe, expect, test, afterAll } from "bun:test";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
  seedTestTableSchema,
} from "../src/content/test-helpers";
import { typeTableMarkerProperties } from "../src/node-capabilities";
import {
  filterRelationshipsByRowDatabaseContext,
  firstRelatedNodeId,
  listRelationshipsForComposite,
  listRelationshipsToDatabaseMembers,
  relatedNodeIds,
  rowBelongsToDatabase,
} from "../src/relationship-traverse";
import type { RelationshipEntry } from "../src/content/relationships-file";
import { RELATIONSHIPS_FILE_VERSION } from "../src/content/relationships-file";
import { invalidateRelationshipTypesCache } from "../src/relationship-types/load";

describe("relationship-traverse", () => {
  const fixture = createTestContentFixture("tome-rel-traverse-");
  const contentDir = fixture.ctx.store.contentDir;
  const scene = "11111111111111111111111111";
  const product = "22222222222222222222222222";
  const part = "33333333333333333333333333";
  const location = "44444444444444444444444444";
  const scenesDb = "55555555555555555555555555";
  const locationsDb = "66666666666666666666666666";

  seedTestNode(fixture, { id: scenesDb, properties: typeTableMarkerProperties("Scenes") });
  seedTestNode(fixture, { id: locationsDb, properties: typeTableMarkerProperties("Locations") });
  seedTestNode(fixture, { id: scene, properties: { title: "Scene" } });
  seedTestNode(fixture, { id: product, properties: { title: "Product" } });
  seedTestNode(fixture, { id: part, properties: { title: "Part" } });
  seedTestNode(fixture, { id: location, properties: { title: "Location" } });
  seedTestTableSchema(fixture, scenesDb, []);
  seedTestTableSchema(fixture, locationsDb, []);
  const typesFile = {
    version: 1 as const,
    types: {
      scenes_product: { perspectives: ["scenes", "product"] },
      scenes_part: { perspectives: ["scenes", "part"] },
      scenes_location: { perspectives: ["location", "scenes"] },
      member_of: { perspectives: ["members", "member_of"], traits: ["set"] },
    },
  };
  fixture.ctx.store.writeRelationshipTypesFile(typesFile);
  invalidateRelationshipTypesCache();

  // Authored tuple order carries the semantics: for "member_of" the set is at
  // index 0 and the member at index 1; asymmetric composites place
  // each endpoint at the index whose perspective matches its role.
  const relationships: RelationshipEntry[] = [
    { a: product, b: scene, type: "scenes_product", properties: { ordinal: 0 } },
    { a: part, b: scene, type: "scenes_part", properties: { ordinal: 0 } },
    {
      a: scene,
      b: location,
      type: "scenes_location",
      properties: { ordinal: 0 },
    },
    { a: scenesDb, b: scene, type: "member_of", properties: { row_index: 0 } },
    { a: locationsDb, b: location, type: "member_of", properties: { row_index: 0 } },
  ];
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
    const members = listRelationshipsToDatabaseMembers(
      fixture.ctx.db,
      location,
      scenesDb,
      contentDir,
    );
    expect(members.some((rel) => otherEndpointFrom(location, rel) === scene)).toBe(true);
  });

  test("rowBelongsToDatabase reflects is_a membership", () => {
    expect(rowBelongsToDatabase(fixture.ctx.db, scene, scenesDb, contentDir)).toBe(true);
    expect(rowBelongsToDatabase(fixture.ctx.db, scene, locationsDb, contentDir)).toBe(false);
    expect(rowBelongsToDatabase(fixture.ctx.db, product, scenesDb, contentDir)).toBe(false);
  });

  test("filterRelationshipsByRowDatabaseContext keeps edges for row members", () => {
    const rels = listRelationshipsToDatabaseMembers(
      fixture.ctx.db,
      location,
      scenesDb,
      contentDir,
    );
    const filtered = filterRelationshipsByRowDatabaseContext(
      fixture.ctx.db,
      location,
      locationsDb,
      rels,
      contentDir,
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
      contentDir,
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
