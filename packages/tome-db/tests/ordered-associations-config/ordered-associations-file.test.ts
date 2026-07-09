import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  emptyOrderedAssociationsFile,
  ORDERED_ASSOCIATIONS_FILE_VERSION,
  parseOrderedAssociationsFile,
  serializeOrderedAssociationsFile,
} from "../../src/ordered-associations-config/ordered-associations-file";
import { contentModelDir, tableSchemasFilePath } from "../../src/content/paths";
import { serializeTableSchemasFile } from "../../src/content/table-schemas-file";
import { invalidateTableSchemasCache } from "../../src/table-schemas/load";

const SCENES_DB = "0000000000000000000000000D";
const PARTS_DB = "0000000000000000000000000Z";

const VALID_CONFIG = {
  id: "scenes-by-book",
  typeDatabaseId: SCENES_DB,
  scopeCompositeType: "scenes_product",
  groupCompositeType: "scenes_part",
  partProductCompositeType: "products_parts_database",
  groupTypeDatabaseId: PARTS_DB,
  unassignedGroupTitle: "Unassigned",
  columnViewName: "TWOLD Active",
  excludedColumnKeys: ["order", "product", "part", "status"],
};

function testContentDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "tome-oa-config-"));
  const contentDir = join(dir, "content");
  mkdirSync(contentModelDir(contentDir), { recursive: true });
  writeFileSync(
    tableSchemasFilePath(contentDir),
    serializeTableSchemasFile({
      version: 1,
      tables: {
        [SCENES_DB]: { membershipComposite: "ordered_member_of", columns: [] },
        [PARTS_DB]: { membershipComposite: "ordered_member_of", columns: [] },
      },
    }),
  );
  invalidateTableSchemasCache();
  return contentDir;
}

describe("parseOrderedAssociationsFile", () => {
  test("parses valid file", () => {
    const contentDir = testContentDir();
    const raw = serializeOrderedAssociationsFile({
      version: ORDERED_ASSOCIATIONS_FILE_VERSION,
      configs: [VALID_CONFIG],
    });
    const file = parseOrderedAssociationsFile(raw, contentDir);
    expect(file.version).toBe(1);
    expect(file.configs).toHaveLength(1);
    expect(file.configs[0]?.id).toBe("scenes-by-book");
  });

  test("emptyOrderedAssociationsFile has version and empty configs", () => {
    const file = emptyOrderedAssociationsFile();
    expect(file.version).toBe(ORDERED_ASSOCIATIONS_FILE_VERSION);
    expect(file.configs).toEqual([]);
  });

  test("rejects unsupported version", () => {
    const raw = JSON.stringify({ version: 99, configs: [] });
    expect(() => parseOrderedAssociationsFile(raw)).toThrow(/unsupported version/);
  });

  test("rejects duplicate config ids", () => {
    const contentDir = testContentDir();
    const raw = JSON.stringify({
      version: 1,
      configs: [VALID_CONFIG, { ...VALID_CONFIG }],
    });
    expect(() => parseOrderedAssociationsFile(raw, contentDir)).toThrow(/duplicate config id/);
  });

  test("rejects invalid typeDatabaseId", () => {
    const raw = JSON.stringify({
      version: 1,
      configs: [{ ...VALID_CONFIG, typeDatabaseId: "not-a-node-id" }],
    });
    expect(() => parseOrderedAssociationsFile(raw)).toThrow(/typeDatabaseId/);
  });

  test("rejects missing required string field", () => {
    const contentDir = testContentDir();
    const { id: _id, ...incomplete } = VALID_CONFIG;
    const raw = JSON.stringify({ version: 1, configs: [incomplete] });
    expect(() => parseOrderedAssociationsFile(raw, contentDir)).toThrow(/\.id/);
  });

  test("rejects table without ordered membershipComposite", () => {
    const dir = mkdtempSync(join(tmpdir(), "tome-oa-config-plain-"));
    const contentDir = join(dir, "content");
    mkdirSync(contentModelDir(contentDir), { recursive: true });
    writeFileSync(
      tableSchemasFilePath(contentDir),
      serializeTableSchemasFile({
        version: 1,
        tables: { [SCENES_DB]: { columns: [] }, [PARTS_DB]: { membershipComposite: "ordered_member_of", columns: [] } },
      }),
    );
    invalidateTableSchemasCache();
    const raw = serializeOrderedAssociationsFile({
      version: ORDERED_ASSOCIATIONS_FILE_VERSION,
      configs: [VALID_CONFIG],
    });
    expect(() => parseOrderedAssociationsFile(raw, contentDir)).toThrow(/membershipComposite/);
  });
});
