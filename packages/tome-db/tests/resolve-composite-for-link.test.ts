import { describe, expect, test, afterAll } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { linkOutgoingRelationship } from "../src/relationship-link-mutations";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
} from "../src/content/test-helpers";
import { contentModelDir, relationshipTypesFilePath, tableSchemasFilePath } from "../src/content/paths";
import {
  parseRelationshipTypesFile,
  serializeRelationshipTypesFile,
} from "../src/content/relationship-types-file";
import { serializeTableSchemasFile } from "../src/content/table-schemas-file";
import { invalidateRelationshipTypesCache } from "../src/relationship-types/load";
import { invalidateTableSchemasCache } from "../src/table-schemas/load";
import { typeTableMarkerProperties } from "../src/node-capabilities";
import { resolveCompositeTypeForLink } from "../src/content/resolve-composite-for-link";
import { readFileSync } from "node:fs";

describe("resolveCompositeTypeForLink", () => {
  const dir = mkdtempSync(join(tmpdir(), "tome-composite-link-"));
  const contentDir = join(dir, "content");
  mkdirSync(contentModelDir(contentDir), { recursive: true });

  const productsDb = "0000000000000000000000000S";
  const scenesDb = "0000000000000000000000000D";
  const productId = "0000000000000000000000000R";
  const sceneId = "00000000000000000000000015";

  const registry = parseRelationshipTypesFile(
    readFileSync("/workspaces/marloth-story/content/model/relationship-types.json", "utf-8"),
  );

  writeFileSync(
    tableSchemasFilePath(contentDir),
    serializeTableSchemasFile({
      version: 1,
      tables: {
        [productsDb]: {
          columns: [
            {
              key: "scenes",
              name: "Scenes",
              type: "relation",
              relationshipType: "scenes_product",
            },
          ],
        },
        [scenesDb]: {
          columns: [
            {
              key: "product",
              name: "Product",
              type: "relation",
              relationshipType: "scenes_product",
            },
          ],
        },
      },
    }),
  );
  invalidateTableSchemasCache();

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("product→scene scenes link resolves to scenes_product", () => {
    const relationships = [
      { a: productsDb, b: productId, type: "member_of", properties: {} },
      { a: scenesDb, b: sceneId, type: "member_of", properties: {} },
    ];
    expect(
      resolveCompositeTypeForLink(
        registry,
        relationships,
        contentDir,
        productId,
        sceneId,
        "scenes",
      ),
    ).toBe("scenes_product");
  });

  test("scene→product product link resolves to scenes_product", () => {
    const relationships = [
      { a: productsDb, b: productId, type: "member_of", properties: {} },
      { a: scenesDb, b: sceneId, type: "member_of", properties: {} },
    ];
    expect(
      resolveCompositeTypeForLink(
        registry,
        relationships,
        contentDir,
        sceneId,
        productId,
        "product",
      ),
    ).toBe("scenes_product");
  });

  test("routes member_of and members perspectives via set trait", () => {
    const setRegistry = parseRelationshipTypesFile(
      JSON.stringify({
        version: 1,
        types: {
          member_of: { perspectives: ["members", "member_of"], traits: ["set"] },
        },
      }),
    );
    expect(
      resolveCompositeTypeForLink(setRegistry, [], contentDir, productId, productsDb, "member_of"),
    ).toBe("member_of");
    expect(
      resolveCompositeTypeForLink(setRegistry, [], contentDir, productsDb, productId, "members"),
    ).toBe("member_of");
  });
});

describe("linkOutgoingRelationship scenes_product from product", () => {
  const fixture = createTestContentFixture("tome-scenes-product-link-");
  const ctx = fixture.ctx;

  const productsDb = "0000000000000000000000000S";
  const scenesDb = "0000000000000000000000000D";
  const productId = "0000000000000000000000000R";
  const sceneId = "00000000000000000000000015";

  writeFileSync(
    relationshipTypesFilePath(fixture.ctx.store.contentDir),
    serializeRelationshipTypesFile({
      version: 1,
      types: {
        member_of: { perspectives: ["members", "member_of"], traits: ["set"] },
        scenes_product: { perspectives: ["scenes", "product"] },
      },
    }),
  );
  invalidateRelationshipTypesCache();

  writeFileSync(
    tableSchemasFilePath(fixture.ctx.store.contentDir),
    serializeTableSchemasFile({
      version: 1,
      tables: {
        [productsDb]: {
          columns: [
            {
              key: "scenes",
              name: "Scenes",
              type: "relation",
              relationshipType: "scenes_product",
            },
          ],
        },
        [scenesDb]: {
          columns: [
            {
              key: "product",
              name: "Product",
              type: "relation",
              relationshipType: "scenes_product",
            },
          ],
        },
      },
    }),
  );
  invalidateTableSchemasCache();

  afterAll(() => {
    destroyTestContentFixture(fixture);
  });

  test("stores scenes_product when linking scene from product page", () => {
    seedTestNode(fixture, {
      id: productsDb,
      properties: typeTableMarkerProperties("Products"),
    });
    seedTestNode(fixture, {
      id: scenesDb,
      properties: typeTableMarkerProperties("Scenes"),
    });
    seedTestNode(fixture, { id: productId, properties: { title: "The Shadowhood" } });
    seedTestNode(fixture, { id: sceneId, properties: { title: "Crash scene" } });
    ctx.store.upsertRelationship(productId, productsDb, "member_of", { view: "all" });
    ctx.store.upsertRelationship(sceneId, scenesDb, "member_of", { view: "default" });

    expect(
      linkOutgoingRelationship(ctx, {
        sourceId: productId,
        targetId: sceneId,
        type: "scenes",
      }),
    ).toBeNull();

    // scenes_product perspectives = [scenes, product]; linking via "scenes" from
    // the product places the product at index 0 (its "scenes" perspective).
    const entry = ctx.store
      .readRelationshipsFile()
      .relationships.find((row) => row.a === productId && row.b === sceneId);
    expect(entry?.type).toBe("scenes_product");
  });
});

describe("LinkResolutionError", () => {
  const fixture = createTestContentFixture("tome-link-resolution-error-");
  const ctx = fixture.ctx;

  afterAll(() => {
    destroyTestContentFixture(fixture);
  });

  test("linkOutgoingRelationship returns unresolvable_type for unknown perspective", () => {
    const nodeA = "00000000000000000000000031";
    const nodeB = "00000000000000000000000037";
    seedTestNode(fixture, { id: nodeA, properties: { title: "A" } });
    seedTestNode(fixture, { id: nodeB, properties: { title: "B" } });

    const error = linkOutgoingRelationship(ctx, {
      sourceId: nodeA,
      targetId: nodeB,
      type: "completely_unknown_type",
    });
    expect(error).toBe("unresolvable_type");
  });

  test("parents perspective resolves to parents_children composite", () => {
    const nodeA = "0000000000000000000000002E";
    const nodeB = "0000000000000000000000002Q";
    seedTestNode(fixture, { id: nodeA, properties: { title: "Child" } });
    seedTestNode(fixture, { id: nodeB, properties: { title: "Parent" } });

    expect(
      linkOutgoingRelationship(ctx, {
        sourceId: nodeA,
        targetId: nodeB,
        type: "parents",
      }),
    ).toBeNull();

    const entry = ctx.store
      .readRelationshipsFile()
      .relationships.find(
        (row) => (row.a === nodeA || row.b === nodeA) && (row.a === nodeB || row.b === nodeB),
      );
    expect(entry?.type).toBe("parents_children");
  });
});

describe("named composite link identity does not bleed", () => {
  const fixture = createTestContentFixture("tome-named-composite-bleed-");
  const ctx = fixture.ctx;

  const scenesDb = "0000000000000000000000000D";
  const charactersDb = "0000000000000000000000000C";
  const featuresDb = "0000000000000000000000000F";
  const sceneId = "00000000000000000000000015";
  const characterId = "00000000000000000000000016";
  const featureId = "00000000000000000000000017";

  writeFileSync(
    relationshipTypesFilePath(fixture.ctx.store.contentDir),
    serializeRelationshipTypesFile({
      version: 1,
      types: {
        member_of: { perspectives: ["members", "member_of"], traits: ["set"] },
        scenes_characters: {
          perspectives: ["characters", "scenes"],
          endpoints: {
            "0": { typeId: scenesDb },
            "1": { typeId: charactersDb },
          },
        },
        scenes_features: {
          perspectives: ["features", "scenes"],
          endpoints: {
            "0": { typeId: scenesDb },
            "1": { typeId: featuresDb },
          },
        },
      },
    }),
  );
  invalidateRelationshipTypesCache();

  writeFileSync(
    tableSchemasFilePath(fixture.ctx.store.contentDir),
    serializeTableSchemasFile({
      version: 1,
      tables: {
        [scenesDb]: {
          columns: [
            {
              key: "characters",
              name: "Characters",
              type: "relation",
              relationshipType: "scenes_characters",
            },
            {
              key: "features",
              name: "Features",
              type: "relation",
              relationshipType: "scenes_features",
            },
          ],
        },
        [charactersDb]: { columns: [] },
        [featuresDb]: { columns: [] },
      },
    }),
  );
  invalidateTableSchemasCache();

  afterAll(() => {
    destroyTestContentFixture(fixture);
  });

  test("scene→character and scene→feature store as distinct composite types", () => {
    seedTestNode(fixture, {
      id: scenesDb,
      properties: typeTableMarkerProperties("Scenes"),
    });
    seedTestNode(fixture, {
      id: charactersDb,
      properties: typeTableMarkerProperties("Characters"),
    });
    seedTestNode(fixture, {
      id: featuresDb,
      properties: typeTableMarkerProperties("Features"),
    });
    seedTestNode(fixture, { id: sceneId, properties: { title: "Crash scene" } });
    seedTestNode(fixture, { id: characterId, properties: { title: "Hero" } });
    seedTestNode(fixture, { id: featureId, properties: { title: "Combat" } });
    ctx.store.upsertRelationship(sceneId, scenesDb, "member_of", { view: "default" });
    ctx.store.upsertRelationship(characterId, charactersDb, "member_of", { view: "default" });
    ctx.store.upsertRelationship(featureId, featuresDb, "member_of", { view: "default" });

    expect(
      linkOutgoingRelationship(ctx, {
        sourceId: sceneId,
        targetId: characterId,
        type: "characters",
      }),
    ).toBeNull();
    expect(
      linkOutgoingRelationship(ctx, {
        sourceId: sceneId,
        targetId: featureId,
        type: "features",
      }),
    ).toBeNull();

    const relationships = ctx.store.readRelationshipsFile().relationships;
    const characterEdge = relationships.find(
      (row) =>
        (row.a === sceneId && row.b === characterId) ||
        (row.a === characterId && row.b === sceneId),
    );
    const featureEdge = relationships.find(
      (row) =>
        (row.a === sceneId && row.b === featureId) || (row.a === featureId && row.b === sceneId),
    );
    expect(characterEdge?.type).toBe("scenes_characters");
    expect(featureEdge?.type).toBe("scenes_features");

    ctx.store.deleteRelationship(sceneId, characterId, "characters");
    const afterDelete = ctx.store.readRelationshipsFile().relationships;
    expect(
      afterDelete.find(
        (row) =>
          (row.a === sceneId && row.b === characterId) ||
          (row.a === characterId && row.b === sceneId),
      ),
    ).toBeUndefined();
    expect(
      afterDelete.find(
        (row) =>
          (row.a === sceneId && row.b === featureId) || (row.a === featureId && row.b === sceneId),
      )?.type,
    ).toBe("scenes_features");
  });
});
