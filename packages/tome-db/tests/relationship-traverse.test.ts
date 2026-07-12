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
import type { RelationshipEntry } from "tome-flatfile";
import { RELATIONSHIPS_FILE_VERSION } from "tome-flatfile";
import { invalidateAssociationsCache } from "tome-flatfile";

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
    associations: {
      "000000000000000000000000A3": { perspectives: ["scenes", "product"] },
      "000000000000000000000000A4": { perspectives: ["scenes", "part"] },
      "000000000000000000000000BA": { perspectives: ["location", "scenes"] },
      "000000000000000000000000A1": { perspectives: ["Members", "Membership"], traits: ["set"] },
    },
  };
  fixture.ctx.store.writeAssociationsFile(typesFile);
  invalidateAssociationsCache();

  // Authored tuple order carries the semantics: for "member_of" the set is at
  // index 0 and the member at index 1; asymmetric composites place
  // each endpoint at the index whose perspective matches its role.
  const relationships: RelationshipEntry[] = [
    { a: product, b: scene, type: "000000000000000000000000A3", properties: { ordinal: 0 } },
    { a: part, b: scene, type: "000000000000000000000000A4", properties: { ordinal: 0 } },
    {
      a: scene,
      b: location,
      type: "000000000000000000000000BA",
      properties: { ordinal: 0 },
    },
    { a: scenesDb, b: scene, type: "000000000000000000000000A1", properties: { row_index: 0 } },
    { a: locationsDb, b: location, type: "000000000000000000000000A1", properties: { row_index: 0 } },
  ];
  fixture.ctx.store.writeRelationshipsFile({
    version: RELATIONSHIPS_FILE_VERSION,
    relationships,
  });
  fixture.ctx.sync.syncRelationships();

  test("finds product through scenes_product composite", () => {
    expect(firstRelatedNodeId(fixture.ctx.cache, scene, "000000000000000000000000A3")).toBe(product);
    expect(relatedNodeIds(fixture.ctx.cache, scene, "000000000000000000000000A3")).toEqual([product]);
  });

  test("finds part through scenes_part composite", () => {
    expect(firstRelatedNodeId(fixture.ctx.cache, scene, "000000000000000000000000A4")).toBe(part);
  });

  test("finds scene from location through scenes_location composite", () => {
    const rels = listRelationshipsForComposite(fixture.ctx.cache, location, "000000000000000000000000BA");
    expect(rels.some((rel) => rel.sourceNodeId === location || rel.targetNodeId === location)).toBe(
      true,
    );
    const members = listRelationshipsToDatabaseMembers(
      fixture.ctx.cache,
      location,
      scenesDb,
      contentDir,
    );
    expect(members.some((rel) => otherEndpointFrom(location, rel) === scene)).toBe(true);
  });

  test("rowBelongsToDatabase reflects is_a membership", () => {
    expect(rowBelongsToDatabase(fixture.ctx.cache, scene, scenesDb, contentDir)).toBe(true);
    expect(rowBelongsToDatabase(fixture.ctx.cache, scene, locationsDb, contentDir)).toBe(false);
    expect(rowBelongsToDatabase(fixture.ctx.cache, product, scenesDb, contentDir)).toBe(false);
  });

  test("filterRelationshipsByRowDatabaseContext keeps edges for row members", () => {
    const rels = listRelationshipsToDatabaseMembers(
      fixture.ctx.cache,
      location,
      scenesDb,
      contentDir,
    );
    const filtered = filterRelationshipsByRowDatabaseContext(
      fixture.ctx.cache,
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
      fixture.ctx.cache,
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
