import { describe, expect, test, afterAll } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { contentModelDir, tableSchemasFilePath } from "../src/content/paths";
import { parseAssociationsFile } from "../src/content/associations-file";
import { serializeTableSchemasFile } from "../src/content/table-schemas-file";
import { invalidateTableSchemasCache } from "../src/table-schemas/load";
import { resolveAssociationIdForLink } from "../src/content/resolve-composite-for-link";

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
        [SCENES_PRODUCT]: { perspectives: ["scenes", "product"] },
        [CHILDREN_CHILDREN]: { perspectives: ["children", "children"] },
        [MEMBER_OF]: { perspectives: ["members", "member_of"], traits: ["set"] },
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

  test("product→scene scenes link resolves to scenes_product association id", () => {
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
        "scenes",
      ),
    ).toBe(SCENES_PRODUCT);
  });

  test("scene→product product link resolves to scenes_product association id", () => {
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
        "product",
      ),
    ).toBe(SCENES_PRODUCT);
  });

  test("routes member_of and members perspectives via set trait", () => {
    expect(
      resolveAssociationIdForLink(registry, [], contentDir, productId, productsDb, "member_of"),
    ).toBe(MEMBER_OF);
    expect(
      resolveAssociationIdForLink(registry, [], contentDir, productsDb, productId, "members"),
    ).toBe(MEMBER_OF);
  });

  test("children perspective from Groups member resolves to children_children via table-schema", () => {
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
        "children",
      ),
    ).toBe(CHILDREN_CHILDREN);
  });
});
