import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import {
  buildRelationshipOrderContext,
  migrateRelationshipOrder,
  reorderRelationshipsFile,
  type RelationshipOrderContext,
} from "../../src/migrations/relationship-order";
import {
  parseRelationshipsFile,
  type RelationshipsFile,
} from "../../src/content/relationships-file";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
  seedTestTableSchema,
} from "../../src/content/test-helpers";
import { relationshipsFilePath } from "../../src/content/paths";
import { typeTableMarkerProperties } from "../../src/node-capabilities";

// Synthetic type-table + node ids (only identity matters for the pure logic).
const PRODUCT_TYPE = "00000000000000000000000P01";
const SCENE_TYPE = "00000000000000000000000S01";
const GROUP_TYPE = "00000000000000000000000G01";
const setId = "00000000000000000000000SET";
const member = "0000000000000000000000MEMB";
const product = "0000000000000000000000PROD";
const scene = "0000000000000000000000SCEN";
const parent = "0000000000000000000000PRNT";
const child = "0000000000000000000000CHLD";

function ctxFixture(): RelationshipOrderContext {
  return {
    registry: {
      version: 1,
      types: {
        member_of: { perspectives: ["members", "member_of"], traits: { set: true } },
        scenes_product: { perspectives: ["scenes", "product"] },
        parents_children: { perspectives: ["children", "parents"] },
        includes: { perspectives: ["includes", "includes"] },
      },
    },
    setNodeIds: new Set([setId, PRODUCT_TYPE, SCENE_TYPE, GROUP_TYPE]),
    nodeTypes: new Map([
      [product, new Set([PRODUCT_TYPE])],
      [scene, new Set([SCENE_TYPE])],
      [parent, new Set([GROUP_TYPE])],
      [child, new Set([GROUP_TYPE])],
    ]),
    relationTriples: new Set([
      // Product owns the "scenes" column targeting Scene.
      `${PRODUCT_TYPE}\u0000scenes\u0000${SCENE_TYPE}`,
      // Scene owns the inverse "product" column targeting Product.
      `${SCENE_TYPE}\u0000product\u0000${PRODUCT_TYPE}`,
      // Groups are self-referential for parents/children (ambiguous by design).
      `${GROUP_TYPE}\u0000children\u0000${GROUP_TYPE}`,
      `${GROUP_TYPE}\u0000parents\u0000${GROUP_TYPE}`,
    ]),
  };
}

describe("reorderRelationshipsFile", () => {
  test("member_of places the parent at index 0 and child at index 1", () => {
    const file: RelationshipsFile = {
      version: 2,
      relationships: [{ a: member, b: setId, type: "member_of", properties: { row_index: 3 } }],
    };
    const { file: next, report } = reorderRelationshipsFile(file, ctxFixture());
    expect(next.version).toBe(3);
    expect(next.relationships[0]).toEqual({
      a: setId,
      b: member,
      type: "member_of",
      properties: { row_index: 3 },
    });
    expect(report.reordered).toBe(1);
  });

  test("member_of already in parent->child order is left unchanged", () => {
    const file: RelationshipsFile = {
      version: 2,
      relationships: [{ a: setId, b: member, type: "member_of" }],
    };
    const { report } = reorderRelationshipsFile(file, ctxFixture());
    expect(report.reordered).toBe(0);
    expect(report.unchanged).toBe(1);
  });

  test("asymmetric cross-type edge is oriented by node type, not authored order", () => {
    // Authored scene-first; product owns perspectives[0] ("scenes") so it must lead.
    const file: RelationshipsFile = {
      version: 2,
      relationships: [{ a: scene, b: product, type: "scenes_product" }],
    };
    const { file: next, report } = reorderRelationshipsFile(file, ctxFixture());
    expect(next.relationships[0]).toMatchObject({ a: product, b: scene, type: "scenes_product" });
    expect(report.reordered).toBe(1);
  });

  test("same-type asymmetric edge is ambiguous and kept as-is", () => {
    const file: RelationshipsFile = {
      version: 2,
      relationships: [{ a: parent, b: child, type: "parents_children" }],
    };
    const { file: next, report } = reorderRelationshipsFile(file, ctxFixture());
    expect(next.relationships[0]).toMatchObject({ a: parent, b: child });
    expect(report.reordered).toBe(0);
    expect(report.ambiguous).toHaveLength(1);
    expect(report.ambiguous[0]?.type).toBe("parents_children");
  });

  test("symmetric type is left untouched", () => {
    const file: RelationshipsFile = {
      version: 2,
      relationships: [{ a: scene, b: product, type: "includes" }],
    };
    const { report } = reorderRelationshipsFile(file, ctxFixture());
    expect(report.reordered).toBe(0);
    expect(report.unchanged).toBe(1);
  });

  test("is idempotent (second pass reorders nothing)", () => {
    const ctx = ctxFixture();
    const file: RelationshipsFile = {
      version: 2,
      relationships: [
        { a: member, b: setId, type: "member_of" },
        { a: scene, b: product, type: "scenes_product" },
        { a: parent, b: child, type: "parents_children" },
      ],
    };
    const once = reorderRelationshipsFile(file, ctx);
    expect(once.report.reordered).toBe(2);
    const twice = reorderRelationshipsFile(once.file, ctx);
    expect(twice.report.reordered).toBe(0);
  });
});

describe("migrateRelationshipOrder (end-to-end over a content dir)", () => {
  const fixture = createTestContentFixture("tome-rel-order-migrate-");
  const contentDir = fixture.ctx.store.contentDir;
  const productsDb = "00000000000000000000000D01";
  const scenesDb = "00000000000000000000000D02";
  const prod = "0000000000000000000000PRD2";
  const scn = "0000000000000000000000SCN2";

  afterAll(() => destroyTestContentFixture(fixture));

  test("reorders on-disk relationships.json and bumps version to 3", () => {
    seedTestNode(fixture, { id: productsDb, properties: typeTableMarkerProperties("Products") });
    seedTestNode(fixture, { id: scenesDb, properties: typeTableMarkerProperties("Scenes") });
    seedTestNode(fixture, { id: prod, properties: { title: "Product" } });
    seedTestNode(fixture, { id: scn, properties: { title: "Scene" } });

    // Products type table owns the "scenes" column -> Scenes type table.
    seedTestTableSchema(fixture, productsDb, [
      { key: "scenes", name: "Scenes", type: "relation", targetTypeId: scenesDb, perspective: "scenes" },
    ]);
    seedTestTableSchema(fixture, scenesDb, [
      { key: "product", name: "Product", type: "relation", targetTypeId: productsDb, perspective: "product" },
    ]);

    fixture.ctx.store.writeRelationshipTypesFile({
      version: 1,
      types: {
        member_of: { perspectives: ["members", "member_of"], traits: { set: true } },
        scenes_product: { perspectives: ["scenes", "product"] },
      },
    });

    // Author a v2 file with child-first membership and scene-first product edge.
    writeFileSync(
      relationshipsFilePath(contentDir),
      `${JSON.stringify(
        {
          version: 2,
          relationships: [
            { a: prod, b: productsDb, type: "member_of" },
            { a: scn, b: scenesDb, type: "member_of" },
            { a: scn, b: prod, type: "scenes_product" },
          ],
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );

    const report = migrateRelationshipOrder(contentDir);
    expect(report.reordered).toBe(3);

    const file = parseRelationshipsFile(readFileSync(relationshipsFilePath(contentDir), "utf-8"));
    expect(file.version).toBe(3);
    const memberships = file.relationships.filter((r) => r.type === "member_of");
    for (const m of memberships) {
      expect([productsDb, scenesDb]).toContain(m.a);
      expect([productsDb, scenesDb]).not.toContain(m.b);
    }
    const sp = file.relationships.find((r) => r.type === "scenes_product")!;
    expect(sp.a).toBe(prod);
    expect(sp.b).toBe(scn);
  });

  test("buildRelationshipOrderContext derives node types from member_of edges", () => {
    const file = parseRelationshipsFile(readFileSync(relationshipsFilePath(contentDir), "utf-8"));
    const ctx = buildRelationshipOrderContext(contentDir, file.relationships);
    expect(ctx.setNodeIds.has(productsDb)).toBe(true);
    expect(ctx.nodeTypes.get(prod)?.has(productsDb)).toBe(true);
    expect(ctx.nodeTypes.get(scn)?.has(scenesDb)).toBe(true);
  });
});
