import { describe, expect, test, afterAll, spyOn } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { GraphDatabase } from "tome-sqlite";
import {
  TEST_MEMBER_OF_ASSOCIATION_ID,
} from "../src/content/test-helpers";
import { typeTableMarkerProperties } from "../src/node-capabilities";
import {
  resolveSqlWindowSorts,
  shouldUseSqlDatabaseWindow,
  shouldUseSqlComposedWindow,
} from "../src/table-sql-window";
import type { DatabaseColumnDef } from "../src/database-view";
import { invalidateDynamicPropertiesCache } from "../src/content/sync";
import {
  contentModelDir,
  dynamicPropertiesFilePath,
  associationsFilePath,
  schemaFilePath,
  emptyDynamicPropertiesFile,
  serializeDynamicPropertiesFile,
  serializeSchemaFile,
  serializeAssociationsFile,
  invalidateAssociationsCache,
  invalidateSchemaCache,
} from "tome-flatfile";

describe("resolveSqlWindowSorts / SQL window fail-closed", () => {
  const dir = mkdtempSync(join(tmpdir(), "tome-sql-window-failclosed-"));
  const contentDir = join(dir, "content");
  mkdirSync(contentModelDir(contentDir), { recursive: true });
  writeFileSync(
    dynamicPropertiesFilePath(contentDir),
    serializeDynamicPropertiesFile(emptyDynamicPropertiesFile()),
  );
  writeFileSync(
    associationsFilePath(contentDir),
    serializeAssociationsFile({
      version: 1,
      associations: {
        [TEST_MEMBER_OF_ASSOCIATION_ID]: {
          perspectives: ["Members", "Membership"],
          traits: ["set"],
        },
      },
    }),
  );
  invalidateAssociationsCache();
  writeFileSync(
    schemaFilePath(contentDir),
    serializeSchemaFile({ version: 1, relationshipRules: [], enums: {} }),
  );
  invalidateSchemaCache();

  const dbPath = join(dir, "test.sqlite");
  const db = new GraphDatabase(dbPath);
  const ownerId = "01FC0CSDWN0000000000000001";

  afterAll(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const columnDefs: DatabaseColumnDef[] = [
    { key: "priority", name: "Priority", type: "enum" },
    { key: "parents", name: "Parents", type: "relation", relationType: "PARENTS" },
    { key: "broken_rel", name: "Broken", type: "relation", relationType: "" },
    { key: "mystery", name: "Mystery", type: "number", source: "dynamic" },
  ];

  test("shouldUseSqlDatabaseWindow is true with cache even for non-expressible sorts", () => {
    expect(
      shouldUseSqlDatabaseWindow(
        db,
        { sorts: [{ column: "bad-key!", direction: "asc" }] },
        [{ column: "bad-key!", direction: "asc" }],
        columnDefs,
        { ownerId, contentDir },
      ),
    ).toBe(true);
    expect(
      shouldUseSqlComposedWindow(
        db,
        { sorts: [{ column: "mystery", direction: "desc" }] },
        columnDefs,
        { ownerId, contentDir },
      ),
    ).toBe(true);
  });

  test("shouldUseSqlDatabaseWindow is false without query cache", () => {
    const flat = {
      listRelationshipProjections() {
        return [];
      },
      getNode() {
        return null;
      },
    } as never;
    expect(shouldUseSqlDatabaseWindow(flat, undefined, [], columnDefs)).toBe(false);
    expect(shouldUseSqlComposedWindow(flat, undefined, columnDefs)).toBe(false);
  });

  test("resolveSqlWindowSorts drops unsafe keys and empty relationType", () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const resolved = resolveSqlWindowSorts(
        db,
        ownerId,
        [
          { column: "name", direction: "asc" },
          { column: "bad-key!", direction: "desc" },
          { column: "broken_rel", direction: "asc" },
          { column: "priority", direction: "asc" },
        ],
        columnDefs,
        contentDir,
      );
      expect(resolved.sorts.map((s) => s.column)).toEqual(["name", "priority"]);
      expect(resolved.refusedReasons.length).toBe(2);
      expect(warn.mock.calls.some((c) => String(c[0]).includes("refused SQL window sort"))).toBe(
        true,
      );
    } finally {
      warn.mockRestore();
    }
  });

  test("resolveSqlWindowSorts drops unresolved dyn sorts and keeps expressible ones", () => {
    writeFileSync(
      dynamicPropertiesFilePath(contentDir),
      serializeDynamicPropertiesFile({
        version: 1,
        properties: [
          {
            id: "dyn-mystery",
            owner: ownerId,
            columnKey: "mystery",
            columnName: "Mystery",
            columnType: "number",
            resolverId: "test.unknownResolver",
            params: {},
          },
        ],
        columnSets: [],
      }),
    );
    invalidateDynamicPropertiesCache();

    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const resolved = resolveSqlWindowSorts(
        db,
        ownerId,
        [
          { column: "mystery", direction: "desc" },
          { column: "name", direction: "asc" },
        ],
        columnDefs,
        contentDir,
      );
      expect(resolved.sorts.map((s) => s.column)).toEqual(["name"]);
      expect(resolved.refusedReasons.some((r) => r.includes("unresolved dyn"))).toBe(true);
    } finally {
      warn.mockRestore();
      writeFileSync(
        dynamicPropertiesFilePath(contentDir),
        serializeDynamicPropertiesFile(emptyDynamicPropertiesFile()),
      );
      invalidateDynamicPropertiesCache();
    }
  });
});
