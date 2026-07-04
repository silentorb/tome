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
    readFileSync(
      "/workspaces/silentorb-workbench/repos/marloth-story/content/model/relationship-types.json",
      "utf-8",
    ),
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
              targetTypeId: scenesDb,
              perspective: "scenes",
            },
          ],
        },
        [scenesDb]: {
          columns: [
            {
              key: "product",
              name: "Product",
              type: "relation",
              targetTypeId: productsDb,
              perspective: "product",
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
      { a: productId, b: productsDb, type: "member_of", properties: {} },
      { a: sceneId, b: scenesDb, type: "member_of", properties: {} },
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
      { a: productId, b: productsDb, type: "member_of", properties: {} },
      { a: sceneId, b: scenesDb, type: "member_of", properties: {} },
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
        member_of: { perspectives: ["member_of", "members"] },
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
              targetTypeId: scenesDb,
              perspective: "scenes",
            },
          ],
        },
        [scenesDb]: {
          columns: [
            {
              key: "product",
              name: "Product",
              type: "relation",
              targetTypeId: productsDb,
              perspective: "product",
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
