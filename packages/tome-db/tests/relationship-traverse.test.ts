import { describe, expect, test, afterAll } from "bun:test";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
  seedTestTableSchema,
  TEST_SCENES_PART_RELATIONSHIP_TYPE_ID,
  TEST_SCENES_PRODUCT_RELATIONSHIP_TYPE_ID,
} from "../src/content/test-helpers";
import { typeTableMarkerProperties } from "../src/node-capabilities";
import {
  filterRelationshipsByRowDatabaseContext,
  listRelationshipsForComposite,
  listRelationshipsToDatabaseMembers,
  rowBelongsToDatabase,
} from "../src/relationship-traverse";
import {
  firstRelatedNodeId,
  loadSemanticRelatedPathContext,
  relatedNodeIds,
  relationTokenForRelationshipType,
} from "../src/semantic-related-ids";
import type { RelationshipEntry } from "tome-flatfile";
import { RELATIONSHIPS_FILE_VERSION } from "tome-flatfile";
import { invalidateRelationshipTypesCache } from "tome-flatfile";

describe("relationship-traverse", async () => {
  const fixture = await createTestContentFixture("tome-rel-traverse-");
  const contentDir = fixture.ctx.store.contentDir;
  const scene = "11111111111111111111111111";
  const product = "22222222222222222222222222";
  const part = "33333333333333333333333333";
  const location = "44444444444444444444444444";
  const scenesDb = "55555555555555555555555555";
  const locationsDb = "66666666666666666666666666";
  const productsDb = "77777777777777777777777777";
  const partsDb = "88888888888888888888888888";

  await seedTestNode(fixture, { id: scenesDb, properties: typeTableMarkerProperties("Scenes") });
  await seedTestNode(fixture, { id: locationsDb, properties: typeTableMarkerProperties("Locations") });
  await seedTestNode(fixture, { id: productsDb, properties: typeTableMarkerProperties("Products") });
  await seedTestNode(fixture, { id: partsDb, properties: typeTableMarkerProperties("Parts") });
  await seedTestNode(fixture, { id: scene, properties: { title: "Scene" } });
  await seedTestNode(fixture, { id: product, properties: { title: "Product" } });
  await seedTestNode(fixture, { id: part, properties: { title: "Part" } });
  await seedTestNode(fixture, { id: location, properties: { title: "Location" } });
  seedTestTableSchema(fixture, scenesDb, [
    {
      key: "product",
      name: "Product",
      type: "relation",
      association: TEST_SCENES_PRODUCT_RELATIONSHIP_TYPE_ID,
      endpoint: 0,
    },
    {
      key: "part",
      name: "Part",
      type: "relation",
      association: TEST_SCENES_PART_RELATIONSHIP_TYPE_ID,
      endpoint: 0,
    },
  ]);
  seedTestTableSchema(fixture, locationsDb, []);
  // Drop default presentation schemas (0D/0Z/0S) so PathOntology matches this fixture only.
  seedTestTableSchema(fixture, "0000000000000000000000000D", []);
  seedTestTableSchema(fixture, "0000000000000000000000000Z", []);
  seedTestTableSchema(fixture, "0000000000000000000000000S", []);
  const typesFile = {
    version: 1 as const,
    relationshipTypes: {
      [TEST_SCENES_PRODUCT_RELATIONSHIP_TYPE_ID]: {
        perspectives: ["scenes", "product"] as [string, string],
        endpoints: {
          0: { typeId: scenesDb },
          1: { typeId: productsDb },
        },
      },
      [TEST_SCENES_PART_RELATIONSHIP_TYPE_ID]: {
        perspectives: ["scenes", "part"] as [string, string],
        endpoints: {
          0: { typeId: scenesDb },
          1: { typeId: partsDb },
        },
      },
      "000000000000000000000000BA": { perspectives: ["location", "scenes"] as [string, string] },
      "000000000000000000000000A1": {
        perspectives: ["Members", "Membership"] as [string, string],
        traits: ["set"],
      },
    },
  };
  fixture.ctx.store.writeRelationshipTypesFile(typesFile);
  invalidateRelationshipTypesCache();

  // Authored tuple order carries the semantics: for "member_of" the set is at
  // index 0 and the member at index 1; asymmetric composites place
  // each endpoint at the index whose perspective matches its role.
  const relationships: RelationshipEntry[] = [
    { a: scene, b: product, type: TEST_SCENES_PRODUCT_RELATIONSHIP_TYPE_ID, properties: { ordinal: 0 } },
    { a: scene, b: part, type: TEST_SCENES_PART_RELATIONSHIP_TYPE_ID, properties: { ordinal: 0 } },
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
  await fixture.ctx.sync.syncRelationships();

  const pathContext = loadSemanticRelatedPathContext(contentDir);
  const store = () => fixture.ctx.graphStore;

  test("finds product through scenes_product semantic path", async () => {
    expect(
      await firstRelatedNodeId(
        store(),
        scene,
        TEST_SCENES_PRODUCT_RELATIONSHIP_TYPE_ID,
        scenesDb,
        pathContext,
      ),
    ).toBe(product);
    expect(
      await relatedNodeIds(
        store(),
        scene,
        TEST_SCENES_PRODUCT_RELATIONSHIP_TYPE_ID,
        scenesDb,
        pathContext,
      ),
    ).toEqual([product]);
  });

  test("finds part through scenes_part semantic path", async () => {
    expect(
      await firstRelatedNodeId(
        store(),
        scene,
        TEST_SCENES_PART_RELATIONSHIP_TYPE_ID,
        scenesDb,
        pathContext,
      ),
    ).toBe(part);
  });

  test("relationTokenForRelationshipType fails when column is missing", () => {
    expect(() =>
      relationTokenForRelationshipType(pathContext.tableSchemas, locationsDb, TEST_SCENES_PRODUCT_RELATIONSHIP_TYPE_ID),
    ).toThrow(/No relation column/);
  });

  test("finds scene from location through scenes_location composite", async () => {
    const rels = await listRelationshipsForComposite(fixture.ctx.cache, location, "000000000000000000000000BA");
    expect(rels.some((rel) => rel.sourceNodeId === location || rel.targetNodeId === location)).toBe(
      true,
    );
    const members = await listRelationshipsToDatabaseMembers(
      fixture.ctx.cache,
      location,
      scenesDb,
      contentDir,
    );
    expect(members.some((rel) => otherEndpointFrom(location, rel) === scene)).toBe(true);
  });

  test("rowBelongsToDatabase reflects is_a membership", async () => {
    expect(await rowBelongsToDatabase(fixture.ctx.cache, scene, scenesDb, contentDir)).toBe(true);
    expect(await rowBelongsToDatabase(fixture.ctx.cache, scene, locationsDb, contentDir)).toBe(false);
    expect(await rowBelongsToDatabase(fixture.ctx.cache, product, scenesDb, contentDir)).toBe(false);
  });

  test("filterRelationshipsByRowDatabaseContext keeps edges for row members", async () => {
    const rels = await listRelationshipsToDatabaseMembers(
      fixture.ctx.cache,
      location,
      scenesDb,
      contentDir,
    );
    const filtered = await filterRelationshipsByRowDatabaseContext(
      fixture.ctx.cache,
      location,
      locationsDb,
      rels,
      contentDir,
    );
    expect(filtered).toHaveLength(1);
    expect(otherEndpointFrom(location, filtered[0]!)).toBe(scene);
  });

  test("filterRelationshipsByRowDatabaseContext returns empty when row is not a member", async () => {
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
    const filtered = await filterRelationshipsByRowDatabaseContext(
      fixture.ctx.cache,
      location,
      scenesDb,
      relationships,
      contentDir,
    );
    expect(filtered).toHaveLength(0);
  });

  afterAll(async () => {
    await destroyTestContentFixture(fixture);
  });
});

function otherEndpointFrom(nodeId: string, relationship: { sourceNodeId: string; targetNodeId: string }) {
  return relationship.sourceNodeId === nodeId
    ? relationship.targetNodeId
    : relationship.sourceNodeId;
}
