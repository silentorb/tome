import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  emptyOrderedCollectionsFile,
  ORDERED_COLLECTIONS_FILE_VERSION,
  parseOrderedCollectionsFile,
  serializeOrderedCollectionsFile,
} from "../../src/ordered-collections-config/ordered-collections-file";
import { contentModelDir, associationsFilePath, tableSchemasFilePath } from "../../src/content/paths";
import {
  emptyAssociationsFile,
  registerOrderedSetMembershipType,
  registerSetMembershipType,
  serializeAssociationsFile,
} from "../../src/content/associations-file";
import { serializeTableSchemasFile } from "../../src/content/table-schemas-file";
import { invalidateAssociationsCache } from "../../src/associations/load";
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

function testContentDir(options?: {
  scenesMembershipComposite?: string;
  partsMembershipComposite?: string;
}): string {
  const dir = mkdtempSync(join(tmpdir(), "tome-oa-config-"));
  const contentDir = join(dir, "content");
  mkdirSync(contentModelDir(contentDir), { recursive: true });

  const registry = emptyAssociationsFile();
  registerSetMembershipType(registry);
  registerOrderedSetMembershipType(registry);
  registry.associations.custom_ordered_set = {
    perspectives: ["custom_sets", "custom_ordered_members"],
    traits: ["set", "ordered"],
  };
  writeFileSync(
    associationsFilePath(contentDir),
    serializeAssociationsFile(registry),
  );
  invalidateAssociationsCache();

  writeFileSync(
    tableSchemasFilePath(contentDir),
    serializeTableSchemasFile({
      version: 1,
      tables: {
        [SCENES_DB]: {
          membershipComposite: options?.scenesMembershipComposite ?? "ordered_member_of",
          columns: [],
        },
        [PARTS_DB]: {
          membershipComposite: options?.partsMembershipComposite ?? "ordered_member_of",
          columns: [],
        },
      },
    }),
  );
  invalidateTableSchemasCache();
  return contentDir;
}

describe("parseOrderedCollectionsFile", () => {
  test("parses valid file", () => {
    const contentDir = testContentDir();
    const raw = serializeOrderedCollectionsFile({
      version: ORDERED_COLLECTIONS_FILE_VERSION,
      configs: [VALID_CONFIG],
    });
    const file = parseOrderedCollectionsFile(raw, contentDir);
    expect(file.version).toBe(1);
    expect(file.configs).toHaveLength(1);
    expect(file.configs[0]?.id).toBe("scenes-by-book");
  });

  test("emptyOrderedCollectionsFile has version and empty configs", () => {
    const file = emptyOrderedCollectionsFile();
    expect(file.version).toBe(ORDERED_COLLECTIONS_FILE_VERSION);
    expect(file.configs).toEqual([]);
  });

  test("rejects unsupported version", () => {
    const raw = JSON.stringify({ version: 99, configs: [] });
    expect(() => parseOrderedCollectionsFile(raw)).toThrow(/unsupported version/);
  });

  test("rejects duplicate config ids", () => {
    const contentDir = testContentDir();
    const raw = JSON.stringify({
      version: 1,
      configs: [VALID_CONFIG, { ...VALID_CONFIG }],
    });
    expect(() => parseOrderedCollectionsFile(raw, contentDir)).toThrow(/duplicate config id/);
  });

  test("rejects invalid typeDatabaseId", () => {
    const raw = JSON.stringify({
      version: 1,
      configs: [{ ...VALID_CONFIG, typeDatabaseId: "not-a-node-id" }],
    });
    expect(() => parseOrderedCollectionsFile(raw)).toThrow(/typeDatabaseId/);
  });

  test("rejects missing required string field", () => {
    const contentDir = testContentDir();
    const { id: _id, ...incomplete } = VALID_CONFIG;
    const raw = JSON.stringify({ version: 1, configs: [incomplete] });
    expect(() => parseOrderedCollectionsFile(raw, contentDir)).toThrow(/\.id/);
  });

  test("rejects table without ordered membershipComposite", () => {
    const contentDir = testContentDir();
    writeFileSync(
      tableSchemasFilePath(contentDir),
      serializeTableSchemasFile({
        version: 1,
        tables: { [SCENES_DB]: { columns: [] }, [PARTS_DB]: { membershipComposite: "ordered_member_of", columns: [] } },
      }),
    );
    invalidateTableSchemasCache();
    const raw = serializeOrderedCollectionsFile({
      version: ORDERED_COLLECTIONS_FILE_VERSION,
      configs: [VALID_CONFIG],
    });
    expect(() => parseOrderedCollectionsFile(raw, contentDir)).toThrow(/membershipComposite/);
  });

  test("rejects plain set membershipComposite without ordered trait", () => {
    const contentDir = testContentDir({ scenesMembershipComposite: "member_of" });
    const raw = serializeOrderedCollectionsFile({
      version: ORDERED_COLLECTIONS_FILE_VERSION,
      configs: [VALID_CONFIG],
    });
    expect(() => parseOrderedCollectionsFile(raw, contentDir)).toThrow(/ordered trait/);
  });

  test("accepts custom ordered membershipComposite name", () => {
    const contentDir = testContentDir({
      scenesMembershipComposite: "custom_ordered_set",
      partsMembershipComposite: "custom_ordered_set",
    });
    const raw = serializeOrderedCollectionsFile({
      version: ORDERED_COLLECTIONS_FILE_VERSION,
      configs: [VALID_CONFIG],
    });
    const file = parseOrderedCollectionsFile(raw, contentDir);
    expect(file.configs).toHaveLength(1);
  });
});
