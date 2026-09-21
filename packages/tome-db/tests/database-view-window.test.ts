import {
  TEST_MEMBER_OF_ASSOCIATION_ID,
  TEST_PARENTS_CHILDREN_ASSOCIATION_ID,
} from "../src/content/test-helpers";
import { describe, expect, test, afterAll } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { GraphDatabase } from "tome-sqlite";
import { typeTableMarkerProperties } from "../src/node-capabilities";
import { getDatabaseViewDetail } from "../src/database-view";
import {
  contentModelDir,
  dynamicPropertiesFilePath,
  associationsFilePath,
  schemaFilePath,
  tableSchemasFilePath,
  projectionTypeForEndpoint,
  emptyDynamicPropertiesFile,
  serializeDynamicPropertiesFile,
  serializeTableSchemasFile,
  serializeSchemaFile,
  serializeAssociationsFile,
  invalidateAssociationsCache,
  invalidateSchemaCache,
  invalidateTableSchemasCache,
} from "tome-flatfile";
import { invalidateDynamicPropertiesCache } from "../src/content/sync";

describe("database-view SQL windows", () => {
  const dir = mkdtempSync(join(tmpdir(), "tome-db-view-window-"));
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
        [TEST_PARENTS_CHILDREN_ASSOCIATION_ID]: {
          perspectives: ["Children", "Parents"],
        },
      },
    }),
  );
  invalidateAssociationsCache();
  const dbPath = join(dir, "test.sqlite");
  const db = new GraphDatabase(dbPath);

  function writeTableSchema(
    databaseId: string,
    columns: Parameters<typeof serializeTableSchemasFile>[0]["tables"][string]["columns"],
  ): void {
    writeFileSync(
      tableSchemasFilePath(contentDir),
      serializeTableSchemasFile({
        version: 1,
        tables: {
          [databaseId]: { columns },
        },
      }),
    );
    invalidateTableSchemasCache();
  }

  function writeSchema(): void {
    writeFileSync(
      schemaFilePath(contentDir),
      serializeSchemaFile({
        version: 1,
        relationshipRules: [],
        enums: {},
      }),
    );
    invalidateSchemaCache();
  }

  writeSchema();

  afterAll(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("windows large membership sets with limit offset and total", () => {
    const databaseId = "WWWWWWWWWWWWWWWWWWWWWWWWWW";
    writeTableSchema(databaseId, []);
    db.upsertNode(databaseId, { ...typeTableMarkerProperties("Features") });
    const memberProjection = projectionTypeForEndpoint(TEST_MEMBER_OF_ASSOCIATION_ID, 1);
    for (let i = 0; i < 120; i++) {
      const id = `01WINMEM${String(i).padStart(18, "0")}`;
      db.upsertNode(id, { title: `Feature ${String(i).padStart(3, "0")}` });
      db.upsertRelationship(id, databaseId, memberProjection, {});
    }

    const page = getDatabaseViewDetail(db, databaseId, undefined, contentDir, {
      limit: 50,
      offset: 50,
      sorts: [{ column: "name", direction: "asc" }],
    });
    expect(page?.rowsWindow).toEqual({
      offset: 50,
      limit: 50,
      total: 120,
      hasMore: true,
    });
    expect(page?.rows).toHaveLength(50);
    expect(page?.rows[0]?.name).toBe("Feature 050");
    expect(page?.rows[49]?.name).toBe("Feature 099");
  });

  test("sorts by relation-count in SQL for expressible relation columns", () => {
    const databaseId = "XXXXXXXXXXXXXXXXXXXXXXXXXX";
    writeTableSchema(databaseId, [
      {
        key: "parents",
        name: "Parents",
        type: "relation",
        association: TEST_PARENTS_CHILDREN_ASSOCIATION_ID,
        endpoint: 1,
      },
    ]);
    db.upsertNode(databaseId, { ...typeTableMarkerProperties("Features") });
    const memberProjection = projectionTypeForEndpoint(TEST_MEMBER_OF_ASSOCIATION_ID, 1);
    const parentProjection = projectionTypeForEndpoint(TEST_PARENTS_CHILDREN_ASSOCIATION_ID, 1);

    const low = "01RELLOW000000000000000001";
    const high = "01RELHIGH00000000000000001";
    db.upsertNode(low, { title: "Low links" });
    db.upsertNode(high, { title: "High links" });
    db.upsertRelationship(low, databaseId, memberProjection, {});
    db.upsertRelationship(high, databaseId, memberProjection, {});

    db.upsertNode("01PAR000000000000000000001", { title: "P1" });
    db.upsertNode("01PAR000000000000000000002", { title: "P2" });
    db.upsertRelationship(high, "01PAR000000000000000000001", parentProjection, {});
    db.upsertRelationship(high, "01PAR000000000000000000002", parentProjection, {});
    db.upsertRelationship(low, "01PAR000000000000000000001", parentProjection, {});

    const detail = getDatabaseViewDetail(db, databaseId, undefined, contentDir, {
      limit: 10,
      offset: 0,
      sorts: [{ column: "parents", direction: "desc" }],
    });
    expect(detail?.rows.map((r) => r.nodeId)).toEqual([high, low]);
    expect(detail?.rows[0]?.relationCells?.parents).toHaveLength(2);
  });

  test("q keeps legacy filter path and returns matching rows", () => {
    const databaseId = "YYYYYYYYYYYYYYYYYYYYYYYYYY";
    writeTableSchema(databaseId, []);
    db.upsertNode(databaseId, { ...typeTableMarkerProperties("Features") });
    const memberProjection = projectionTypeForEndpoint(TEST_MEMBER_OF_ASSOCIATION_ID, 1);
    db.upsertNode("01QAAA00000000000000000001", { title: "Alpha quest" });
    db.upsertNode("01QBBB00000000000000000001", { title: "Beta note" });
    db.upsertRelationship("01QAAA00000000000000000001", databaseId, memberProjection, {});
    db.upsertRelationship("01QBBB00000000000000000001", databaseId, memberProjection, {});

    const detail = getDatabaseViewDetail(db, databaseId, undefined, contentDir, {
      q: "quest",
      limit: 50,
      offset: 0,
    });
    expect(detail?.rowsWindow.total).toBe(1);
    expect(detail?.rows[0]?.name).toBe("Alpha quest");
  });

  test("dyn-sort tabs stay on legacy path and still return rows", () => {
    const databaseId = "ZZZZZZZZZZZZZZZZZZZZZZZZZZ";
    writeTableSchema(databaseId, []);
    writeFileSync(
      dynamicPropertiesFilePath(contentDir),
      serializeDynamicPropertiesFile({
        version: 1,
        properties: [
          {
            id: "dyn-weighted",
            owner: databaseId,
            columnKey: "weighted_use",
            columnName: "Weighted use",
            columnType: "number",
            resolverId: "inspirations.weightedUse",
            params: {},
          },
        ],
        columnSets: [],
      }),
    );
    invalidateDynamicPropertiesCache();

    db.upsertNode(databaseId, { ...typeTableMarkerProperties("Features") });
    const memberProjection = projectionTypeForEndpoint(TEST_MEMBER_OF_ASSOCIATION_ID, 1);
    for (let i = 0; i < 3; i++) {
      const id = `01DYNMEM${String(i).padStart(18, "0")}`;
      db.upsertNode(id, { title: `Dyn ${i}` });
      db.upsertRelationship(id, databaseId, memberProjection, {});
    }

    const detail = getDatabaseViewDetail(db, databaseId, undefined, contentDir, {
      sorts: [{ column: "weighted_use", direction: "desc" }],
      limit: 50,
      offset: 0,
    });
    expect(detail?.rowsWindow.total).toBe(3);
    expect(detail?.rows).toHaveLength(3);
    expect(detail?.allColumnDefs?.some((c) => c.key === "weighted_use" && c.source === "dynamic")).toBe(
      true,
    );

    // Restore empty dyn file for later tests in this file (none), keep isolation.
    writeFileSync(
      dynamicPropertiesFilePath(contentDir),
      serializeDynamicPropertiesFile(emptyDynamicPropertiesFile()),
    );
    invalidateDynamicPropertiesCache();
  });
});
