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

  const productsDb = "4e973268d3474f71bd7992094fb39663";
  const scenesDb = "204dba198db74611b0b49a98dd53e8f5";
  const productId = "4d73a389101c473ba6bee76d5b4bf0e4";
  const sceneId = "76404657aa3a47a895430469498ba090";

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

  const productsDb = "4e973268d3474f71bd7992094fb39663";
  const scenesDb = "204dba198db74611b0b49a98dd53e8f5";
  const productId = "4d73a389101c473ba6bee76d5b4bf0e4";
  const sceneId = "76404657aa3a47a895430469498ba090";

  writeFileSync(
    relationshipTypesFilePath(fixture.ctx.store.contentDir),
    serializeRelationshipTypesFile({
      version: 1,
      types: {
        member_of: { bidirectional: true, perspectives: ["member_of", "members"] },
        scenes: { bidirectional: false, perspectives: ["scenes"] },
        scenes_product: { bidirectional: true, perspectives: ["scenes", "product"] },
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

    const entry = ctx.store
      .readRelationshipsFile()
      .relationships.find((row) => row.a === productId && row.b === sceneId);
    expect(entry?.type).toBe("scenes_product");
    expect(entry?.directedFrom).toBeUndefined();
  });
});
