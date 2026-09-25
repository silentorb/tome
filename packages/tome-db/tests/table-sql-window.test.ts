import { describe, expect, test, afterAll, spyOn } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { GraphDatabase } from "tome-sqlite";
import {
  TEST_MEMBER_OF_ASSOCIATION_ID,
} from "../src/content/test-helpers";
import {
  explodeTableWindowRequest,
  resolveSqlWindowSorts,
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

describe("explodeTableWindowRequest", () => {
  const dir = mkdtempSync(join(tmpdir(), "tome-sql-window-explode-"));
  const dbPath = join(dir, "test.sqlite");
  const db = new GraphDatabase(dbPath);

  afterAll(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("sql backend with query cache; searchQuery absent when q empty", () => {
    const plan = explodeTableWindowRequest(db, { limit: 50, offset: 10 });
    expect(plan.backend).toBe("sql");
    expect(plan.searchQuery).toBeUndefined();
    expect(plan.limit).toBe(50);
    expect(plan.offset).toBe(10);
    expect(plan.reasons).toContain("query_cache");
    expect(plan.reasons).not.toContain("table_q");
  });

  test("searchQuery is an operator when q is set (not a backend mode)", () => {
    const plan = explodeTableWindowRequest(db, { q: "  hello  ", limit: 20 });
    expect(plan.backend).toBe("sql");
    expect(plan.searchQuery).toBe("hello");
    expect(plan.reasons).toContain("query_cache");
    expect(plan.reasons).toContain("table_q");
  });

  test("js backend without query cache", () => {
    const flat = {
      listRelationshipProjections() {
        return [];
      },
      getNode() {
        return null;
      },
    } as never;
    const plan = explodeTableWindowRequest(flat, { q: "x" });
    expect(plan.backend).toBe("js");
    expect(plan.searchQuery).toBe("x");
    expect(plan.reasons).toContain("no_query_cache");
    expect(plan.reasons).toContain("table_q");
  });
});

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

  test("explode keeps sql backend even for non-expressible sorts", () => {
    const plan = explodeTableWindowRequest(db, {
      sorts: [{ column: "bad-key!", direction: "asc" }],
    });
    expect(plan.backend).toBe("sql");
    expect(plan.searchQuery).toBeUndefined();
  });

  test("explode is js without query cache", () => {
    const flat = {
      listRelationshipProjections() {
        return [];
      },
      getNode() {
        return null;
      },
    } as never;
    expect(explodeTableWindowRequest(flat, undefined).backend).toBe("js");
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
