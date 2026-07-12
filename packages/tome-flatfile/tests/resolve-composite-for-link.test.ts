import { describe, expect, test, afterAll } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { contentModelDir, tableSchemasFilePath } from "../src/content/paths";
import { parseAssociationsFile, projectionTypeForEndpoint } from "../src/content/associations-file";
import { serializeTableSchemasFile } from "../src/content/table-schemas-file";
import { invalidateTableSchemasCache } from "../src/table-schemas/load";
import { LinkResolutionError, resolveAssociationIdForLink } from "../src/content/resolve-composite-for-link";

const MEMBER_OF = "000000000000000000000000A1";
const SCENES_PRODUCT = "000000000000000000000000A3";
const CHILDREN_CHILDREN = "000000000000000000000000B4";

describe("resolveAssociationIdForLink", () => {
  const dir = mkdtempSync(join(tmpdir(), "tome-composite-link-"));
  const contentDir = join(dir, "content");
  mkdirSync(contentModelDir(contentDir), { recursive: true });

  const productsDb = "0000000000000000000000000S";
  const scenesDb = "0000000000000000000000000D";
  const productId = "0000000000000000000000000R";
  const sceneId = "00000000000000000000000015";

  const registry = parseAssociationsFile(
    JSON.stringify({
      version: 1,
      associations: {
        [SCENES_PRODUCT]: {
          perspectives: ["Scenes", "Product"],
          endpoints: {
            0: { typeId: scenesDb },
            1: { typeId: productsDb },
          },
        },
        [CHILDREN_CHILDREN]: { perspectives: ["Children", "Children"] },
        [MEMBER_OF]: { perspectives: ["Members", "Membership"], traits: ["set"] },
      },
    }),
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
              association: SCENES_PRODUCT,
            },
          ],
        },
        [scenesDb]: {
          columns: [
            {
              key: "product",
              name: "Product",
              type: "relation",
              association: SCENES_PRODUCT,
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

  test("product→scene scenes projection resolves to scenes_product association id", () => {
    const relationships = [
      { a: productsDb, b: productId, type: MEMBER_OF, properties: {} },
      { a: scenesDb, b: sceneId, type: MEMBER_OF, properties: {} },
    ];
    expect(
      resolveAssociationIdForLink(
        registry,
        relationships,
        contentDir,
        productId,
        sceneId,
        projectionTypeForEndpoint(SCENES_PRODUCT, 1),
      ),
    ).toBe(SCENES_PRODUCT);
  });

  test("scene→product product projection resolves to scenes_product association id", () => {
    const relationships = [
      { a: productsDb, b: productId, type: MEMBER_OF, properties: {} },
      { a: scenesDb, b: sceneId, type: MEMBER_OF, properties: {} },
    ];
    expect(
      resolveAssociationIdForLink(
        registry,
        relationships,
        contentDir,
        sceneId,
        productId,
        projectionTypeForEndpoint(SCENES_PRODUCT, 0),
      ),
    ).toBe(SCENES_PRODUCT);
  });

  test("routes set association by ULID", () => {
    expect(
      resolveAssociationIdForLink(registry, [], contentDir, productId, productsDb, MEMBER_OF),
    ).toBe(MEMBER_OF);
    expect(
      resolveAssociationIdForLink(
        registry,
        [],
        contentDir,
        productsDb,
        productId,
        projectionTypeForEndpoint(MEMBER_OF, 0),
      ),
    ).toBe(MEMBER_OF);
  });

  test("children projection from Groups member resolves via table-schema", () => {
    const groupsDb = "01KWN86X6NJZMP5ZESZTNDXY3J";
    const groupMemberId = "000000000000000000000000AA";
    const childGroupId = "000000000000000000000000BB";
    const groupsContentDir = join(dir, "groups-content");
    mkdirSync(contentModelDir(groupsContentDir), { recursive: true });
    writeFileSync(
      tableSchemasFilePath(groupsContentDir),
      serializeTableSchemasFile({
        version: 1,
        tables: {
          [groupsDb]: {
            columns: [
              {
                key: "children",
                name: "Children",
                type: "relation",
                association: CHILDREN_CHILDREN,
              },
            ],
          },
        },
      }),
    );
    invalidateTableSchemasCache();

    const relationships = [
      { a: groupsDb, b: groupMemberId, type: MEMBER_OF, properties: {} },
      { a: groupsDb, b: childGroupId, type: MEMBER_OF, properties: {} },
    ];
    expect(
      resolveAssociationIdForLink(
        registry,
        relationships,
        groupsContentDir,
        groupMemberId,
        childGroupId,
        projectionTypeForEndpoint(CHILDREN_CHILDREN, 0),
      ),
    ).toBe(CHILDREN_CHILDREN);
  });

  test("throws LinkResolutionError for unknown label", () => {
    expect(() =>
      resolveAssociationIdForLink(registry, [], contentDir, productId, productsDb, "member_of"),
    ).toThrow(LinkResolutionError);
  });
});
