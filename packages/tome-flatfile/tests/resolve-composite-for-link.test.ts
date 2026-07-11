import { describe, expect, test, afterAll } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { contentModelDir, tableSchemasFilePath } from "../src/content/paths";
import { parseAssociationsFile } from "../src/content/associations-file";
import { serializeTableSchemasFile } from "../src/content/table-schemas-file";
import { invalidateTableSchemasCache } from "../src/table-schemas/load";
import { resolveAssociationIdForLink } from "../src/content/resolve-composite-for-link";

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
        scenes_product: { perspectives: ["scenes", "product"] },
        children_children: { perspectives: ["children", "children"] },
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
              association: "scenes_product",
            },
          ],
        },
        [scenesDb]: {
          columns: [
            {
              key: "product",
              name: "Product",
              type: "relation",
              association: "scenes_product",
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
      resolveAssociationIdForLink(
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
      resolveAssociationIdForLink(
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
    const setRegistry = parseAssociationsFile(
      JSON.stringify({
        version: 1,
        associations: {
          member_of: { perspectives: ["members", "member_of"], traits: ["set"] },
        },
      }),
    );
    expect(
      resolveAssociationIdForLink(setRegistry, [], contentDir, productId, productsDb, "member_of"),
    ).toBe("member_of");
    expect(
      resolveAssociationIdForLink(setRegistry, [], contentDir, productsDb, productId, "members"),
    ).toBe("member_of");
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
                association: "children_children",
              },
            ],
          },
        },
      }),
    );
    invalidateTableSchemasCache();

    const relationships = [
      { a: groupsDb, b: groupMemberId, type: "member_of", properties: {} },
      { a: groupsDb, b: childGroupId, type: "member_of", properties: {} },
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
    ).toBe("children_children");
  });
});

