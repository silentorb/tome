import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  emptyOrderedCollectionsFile,
  ORDERED_COLLECTIONS_FILE_VERSION,
  parseOrderedCollectionsFile,
  serializeOrderedCollectionsFile,
} from "../../src/ordered-collections-config/ordered-collections-file";
import {
  contentModelDir,
  associationsFilePath,
  tableSchemasFilePath,
  viewsFilePath,
} from "../../src/content/paths";
import {
  emptyAssociationsFile,
  registerSetAssociation,
  serializeAssociationsFile,
} from "../../src/content/associations-file";
import { serializeTableSchemasFile } from "../../src/content/table-schemas-file";
import { serializeViewsFile, VIEWS_FILE_VERSION } from "../../src/content/views-file";
import { invalidateAssociationsCache } from "../../src/associations/load";
import { invalidateTableSchemasCache } from "../../src/table-schemas/load";
import { invalidateViewsCache } from "../../src/views/load";

const SCENES_DB = "0000000000000000000000000D";
const PARTS_DB = "0000000000000000000000000Z";
const MEMBER_OF = "000000000000000000000000A1";
const ORDERED_MEMBER_OF = "000000000000000000000000A2";
const SCENES_PRODUCT = "000000000000000000000000A3";
const SCENES_PART = "000000000000000000000000A4";
const PRODUCTS_PARTS = "000000000000000000000000A5";
const CUSTOM_ORDERED_SET = "000000000000000000000000A6";

const VALID_CONFIG = {
  id: "scenes-by-book",
  typeDatabaseId: SCENES_DB,
  scopeCompositeType: SCENES_PRODUCT,
  groupCompositeType: SCENES_PART,
  partProductCompositeType: PRODUCTS_PARTS,
  groupTypeDatabaseId: PARTS_DB,
  unassignedGroupTitle: "Unassigned",
  columnViewName: "TWOLD Active",
  excludedColumnKeys: ["order", "product", "part", "status"],
};

function testContentDir(options?: {
  registerPlain?: boolean;
  registerOrdered?: boolean;
  registerCustomOrdered?: boolean;
  scenesPerspective?: string;
  partsPerspective?: string;
  seedViews?: boolean;
}): string {
  const dir = mkdtempSync(join(tmpdir(), "tome-oa-config-"));
  const contentDir = join(dir, "content");
  mkdirSync(contentModelDir(contentDir), { recursive: true });

  const registry = emptyAssociationsFile();
  if (options?.registerPlain !== false) {
    registerSetAssociation(registry, {
      id: MEMBER_OF,
      perspectives: ["members", "member_of"],
    });
  }
  if (options?.registerOrdered !== false) {
    registerSetAssociation(registry, {
      id: ORDERED_MEMBER_OF,
      perspectives: ["ordered_members", "ordered_member_of"],
      ordered: true,
    });
  }
  if (options?.registerCustomOrdered) {
    registerSetAssociation(registry, {
      id: CUSTOM_ORDERED_SET,
      perspectives: ["custom_sets", "custom_ordered_members"],
      ordered: true,
    });
  }
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
        [SCENES_DB]: { columns: [] },
        [PARTS_DB]: { columns: [] },
      },
    }),
  );
  invalidateTableSchemasCache();

  if (options?.seedViews !== false) {
    const scenesPerspective = options?.scenesPerspective ?? "ordered_members";
    const partsPerspective = options?.partsPerspective ?? "ordered_members";
    writeFileSync(
      viewsFilePath(contentDir),
      serializeViewsFile({
        version: VIEWS_FILE_VERSION,
        views: [
          {
            nodeId: SCENES_DB,
            perspective: scenesPerspective,
            generator: "scenes-by-book",
          },
          {
            nodeId: PARTS_DB,
            perspective: partsPerspective,
            generator: "scenes-by-book",
          },
        ],
      }),
    );
    invalidateViewsCache();
  }

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

  test("rejects table without ordered set association context", () => {
    const contentDir = testContentDir({ seedViews: false });
    const raw = serializeOrderedCollectionsFile({
      version: ORDERED_COLLECTIONS_FILE_VERSION,
      configs: [VALID_CONFIG],
    });
    expect(() => parseOrderedCollectionsFile(raw, contentDir)).toThrow(/ordered set-trait/);
  });

  test("rejects plain set without ordered trait", () => {
    const contentDir = testContentDir({
      registerOrdered: false,
      scenesPerspective: "members",
      partsPerspective: "members",
    });
    const raw = serializeOrderedCollectionsFile({
      version: ORDERED_COLLECTIONS_FILE_VERSION,
      configs: [VALID_CONFIG],
    });
    expect(() => parseOrderedCollectionsFile(raw, contentDir)).toThrow(/ordered set-trait/);
  });

  test("accepts custom ordered set association via views", () => {
    const contentDir = testContentDir({
      registerCustomOrdered: true,
      scenesPerspective: "custom_sets",
      partsPerspective: "custom_sets",
    });
    const raw = serializeOrderedCollectionsFile({
      version: ORDERED_COLLECTIONS_FILE_VERSION,
      configs: [VALID_CONFIG],
    });
    const file = parseOrderedCollectionsFile(raw, contentDir);
    expect(file.configs).toHaveLength(1);
  });
});
