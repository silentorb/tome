import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  emptyTablePresentationFile,
  parseTablePresentationFile,
  serializeTablePresentationFile,
  TABLE_PRESENTATION_FILE_VERSION,
} from "../../src/table-presentation/table-presentation-file";
import {
  invalidateTablePresentationCache,
  loadTablePresentationFromContent,
} from "../../src/table-presentation/load";
import { contentModelDir, tablePresentationFilePath } from "../../src/content/paths";

const SCENES_DB = "0000000000000000000000000D";
const PARTS_DB = "0000000000000000000000000Z";
const SCENES_PRODUCT = "000000000000000000000000A3";
const SCENES_PART = "000000000000000000000000A4";
const PRODUCTS_PARTS = "000000000000000000000000A5";

const VALID_COMPOSITION = {
  id: "scenes-by-book",
  typeDatabaseId: SCENES_DB,
  scope: {
    memberToScopeComposite: SCENES_PRODUCT,
    excludeColumnKeys: ["product"],
  },
  groups: {
    memberToGroupComposite: SCENES_PART,
    groupTypeDatabaseId: PARTS_DB,
    groupToScopeComposite: PRODUCTS_PARTS,
    unassignedGroupTitle: "Unassigned",
    canonicalGroupByTitle: true,
    excludeColumnKeys: ["part"],
  },
  reorder: {
    excludeColumnKeys: ["order"],
  },
  excludeColumnKeys: ["status"],
};

function serialized(compositions: unknown[]): string {
  return JSON.stringify({ version: TABLE_PRESENTATION_FILE_VERSION, compositions });
}

describe("parseTablePresentationFile", () => {
  test("parses a composition with all three layers", () => {
    const file = parseTablePresentationFile(
      serializeTablePresentationFile({
        version: TABLE_PRESENTATION_FILE_VERSION,
        compositions: [VALID_COMPOSITION],
      }),
    );
    expect(file.version).toBe(TABLE_PRESENTATION_FILE_VERSION);
    expect(file.compositions).toHaveLength(1);
    const composition = file.compositions[0]!;
    expect(composition.id).toBe("scenes-by-book");
    expect(composition.scope?.memberToScopeComposite).toBe(SCENES_PRODUCT);
    expect(composition.groups?.groupToScopeComposite).toBe(PRODUCTS_PARTS);
    expect(composition.groups?.canonicalGroupByTitle).toBe(true);
    expect(composition.reorder?.excludeColumnKeys).toEqual(["order"]);
    expect(composition.excludeColumnKeys).toEqual(["status"]);
  });

  test("layers are independent and all optional", () => {
    const file = parseTablePresentationFile(
      serialized([{ id: "plain", typeDatabaseId: SCENES_DB }]),
    );
    const composition = file.compositions[0]!;
    expect(composition.scope).toBeUndefined();
    expect(composition.groups).toBeUndefined();
    expect(composition.reorder).toBeUndefined();
  });

  test("accepts a reorder-only composition", () => {
    const file = parseTablePresentationFile(
      serialized([{ id: "ordered", typeDatabaseId: SCENES_DB, reorder: {} }]),
    );
    expect(file.compositions[0]?.reorder).toEqual({});
  });

  test("emptyTablePresentationFile has version and no compositions", () => {
    const file = emptyTablePresentationFile();
    expect(file.version).toBe(TABLE_PRESENTATION_FILE_VERSION);
    expect(file.compositions).toEqual([]);
  });

  test("rejects unsupported version", () => {
    expect(() =>
      parseTablePresentationFile(JSON.stringify({ version: 99, compositions: [] })),
    ).toThrow(/unsupported version/);
  });

  test("rejects duplicate composition ids", () => {
    expect(() =>
      parseTablePresentationFile(serialized([VALID_COMPOSITION, { ...VALID_COMPOSITION }])),
    ).toThrow(/duplicate composition id/);
  });

  test("rejects invalid typeDatabaseId", () => {
    expect(() =>
      parseTablePresentationFile(
        serialized([{ ...VALID_COMPOSITION, typeDatabaseId: "not-a-node-id" }]),
      ),
    ).toThrow(/typeDatabaseId/);
  });

  test("rejects a missing composition id", () => {
    const { id: _id, ...incomplete } = VALID_COMPOSITION;
    expect(() => parseTablePresentationFile(serialized([incomplete]))).toThrow(/\.id/);
  });

  test("rejects a scope layer without a member-to-scope composite", () => {
    expect(() =>
      parseTablePresentationFile(
        serialized([{ id: "scoped", typeDatabaseId: SCENES_DB, scope: {} }]),
      ),
    ).toThrow(/memberToScopeComposite/);
  });

  test("rejects a non-ULID association id in a layer", () => {
    expect(() =>
      parseTablePresentationFile(
        serialized([
          {
            id: "scoped",
            typeDatabaseId: SCENES_DB,
            scope: { memberToScopeComposite: "scenes_product" },
          },
        ]),
      ),
    ).toThrow(/association id/);
  });

  test("rejects a groups layer without an unassigned group title", () => {
    expect(() =>
      parseTablePresentationFile(
        serialized([
          {
            id: "grouped",
            typeDatabaseId: SCENES_DB,
            groups: {
              memberToGroupComposite: SCENES_PART,
              groupTypeDatabaseId: PARTS_DB,
            },
          },
        ]),
      ),
    ).toThrow(/unassignedGroupTitle/);
  });
});

describe("loadTablePresentationFromContent", () => {
  function testContentDir(raw?: string): string {
    const dir = mkdtempSync(join(tmpdir(), "tome-table-presentation-"));
    const contentDir = join(dir, "content");
    mkdirSync(contentModelDir(contentDir), { recursive: true });
    if (raw !== undefined) {
      writeFileSync(tablePresentationFilePath(contentDir), raw);
    }
    invalidateTablePresentationCache();
    return contentDir;
  }

  test("returns an empty file when table-presentation.json is absent", () => {
    const file = loadTablePresentationFromContent(testContentDir());
    expect(file.compositions).toEqual([]);
  });

  test("reads compositions from content/model", () => {
    const contentDir = testContentDir(
      serializeTablePresentationFile({
        version: TABLE_PRESENTATION_FILE_VERSION,
        compositions: [VALID_COMPOSITION],
      }),
    );
    const file = loadTablePresentationFromContent(contentDir);
    expect(file.compositions.map((composition) => composition.id)).toEqual(["scenes-by-book"]);
  });
});
