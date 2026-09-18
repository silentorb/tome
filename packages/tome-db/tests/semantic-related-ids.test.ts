import { afterAll, describe, expect, test } from "bun:test";
import { typeTableMarkerProperties } from "../src/node-capabilities";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestCompositeRelationships,
  seedTestNode,
  seedTestRelationships,
  seedTestTableSchema,
  TEST_SCENES_PRODUCT_ASSOCIATION_ID,
} from "../src/content/test-helpers";
import {
  firstRelatedNodeId,
  loadSemanticRelatedPathContext,
  relationTokenForAssociation,
} from "../src/semantic-related-ids";

const SCENES_DB = "0000000000000000000000000D";
const PRODUCTS_DB = "0000000000000000000000000S";
const scene = "33333333333333333333333333";
const book = "AAAAAAAAAAAAAAAAAAAAAAAAAA";

describe("semantic-related-ids", () => {
  const fixture = createTestContentFixture("tome-semantic-related-");
  const contentDir = fixture.ctx.store.contentDir;

  seedTestNode(fixture, { id: SCENES_DB, properties: typeTableMarkerProperties("Scenes") });
  seedTestNode(fixture, { id: PRODUCTS_DB, properties: typeTableMarkerProperties("Products") });
  seedTestNode(fixture, { id: scene, properties: { title: "Scene" } });
  seedTestNode(fixture, { id: book, properties: { title: "Book" } });
  seedTestRelationships(fixture, [
    { source: scene, target: SCENES_DB, type: "ordered_member_of", properties: { order: "1" } },
    { source: book, target: PRODUCTS_DB, type: "ordered_member_of", properties: { order: "1" } },
  ]);
  seedTestCompositeRelationships(fixture, [
    {
      a: scene,
      b: book,
      typeFromA: "Scenes",
      typeFromB: "Product",
      associationId: TEST_SCENES_PRODUCT_ASSOCIATION_ID,
      properties: { ordinal: 0 },
    },
  ]);

  const registry = fixture.ctx.store.readAssociationsFile();
  registry.associations[TEST_SCENES_PRODUCT_ASSOCIATION_ID] = {
    perspectives: ["Scenes", "Product"],
    endpoints: {
      0: { typeId: SCENES_DB },
      1: { typeId: PRODUCTS_DB },
    },
  };
  fixture.ctx.store.writeAssociationsFile(registry);
  fixture.ctx.sync.syncRelationships();

  test("resolves related id through Imp semantic bind", () => {
    const pathContext = loadSemanticRelatedPathContext(contentDir);
    expect(
      relationTokenForAssociation(
        pathContext.tableSchemas,
        SCENES_DB,
        TEST_SCENES_PRODUCT_ASSOCIATION_ID,
      ),
    ).toBe("product");
    expect(
      firstRelatedNodeId(
        fixture.ctx.graphStore,
        scene,
        TEST_SCENES_PRODUCT_ASSOCIATION_ID,
        SCENES_DB,
        pathContext,
      ),
    ).toBe(book);
  });

  test("fails without a table-schema relation column (no composite-SQL fallback)", () => {
    seedTestTableSchema(fixture, SCENES_DB, []);
    const pathContext = loadSemanticRelatedPathContext(contentDir);
    expect(() =>
      firstRelatedNodeId(
        fixture.ctx.graphStore,
        scene,
        TEST_SCENES_PRODUCT_ASSOCIATION_ID,
        SCENES_DB,
        pathContext,
      ),
    ).toThrow(/No relation column/);
  });

  test("rejects non-queryable stores", () => {
    // Restore schema so bind can succeed if executeImp were present.
    seedTestTableSchema(fixture, SCENES_DB, [
      {
        key: "product",
        name: "Product",
        type: "relation",
        association: TEST_SCENES_PRODUCT_ASSOCIATION_ID,
        endpoint: 0,
      },
    ]);
    const pathContext = loadSemanticRelatedPathContext(contentDir);
    expect(() =>
      firstRelatedNodeId(
        fixture.ctx.cache,
        scene,
        TEST_SCENES_PRODUCT_ASSOCIATION_ID,
        SCENES_DB,
        pathContext,
      ),
    ).toThrow(/Queryable graph store/);
  });

  afterAll(() => {
    destroyTestContentFixture(fixture);
  });
});
