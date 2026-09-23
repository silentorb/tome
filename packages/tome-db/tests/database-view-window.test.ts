import {
  TEST_MEMBER_OF_ASSOCIATION_ID,
  TEST_PARENTS_CHILDREN_ASSOCIATION_ID,
} from "../src/content/test-helpers";
import { describe, expect, test, afterAll, spyOn } from "bun:test";
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

  test("q without searcher returns empty SQL search window", () => {
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
    expect(detail?.rowsWindow.total).toBe(0);
    expect(detail?.rows).toHaveLength(0);
  });

  test("q with searcher windows via scoped search without full materialize", () => {
    const databaseId = "Y1Y1Y1Y1Y1Y1Y1Y1Y1Y1Y1Y1Y1";
    writeTableSchema(databaseId, []);
    db.upsertNode(databaseId, { ...typeTableMarkerProperties("Features") });
    const memberProjection = projectionTypeForEndpoint(TEST_MEMBER_OF_ASSOCIATION_ID, 1);
    const matchId = "01QMATCH000000000000000001";
    const otherId = "01QOTHER000000000000000001";
    db.upsertNode(matchId, { title: "Scoped quest hit" });
    db.upsertNode(otherId, { title: "Other note" });
    db.upsertRelationship(matchId, databaseId, memberProjection, {});
    db.upsertRelationship(otherId, databaseId, memberProjection, {});

    const pattern = (q: string) => `%${q.replace(/[%_\\]/g, "\\$&")}%`;
    const search = {
      search() {
        return [];
      },
      searchWindow(request: {
        query: string;
        limit?: number | null;
        offset?: number;
        allowedNodeIds?: ReadonlySet<string>;
      }) {
        const result = db.searchNodesLikeWindow(pattern(request.query), {
          offset: request.offset,
          limit: request.limit,
          allowedNodeIds: request.allowedNodeIds,
        });
        return {
          hits: result.rows.map((row) => ({ id: row.id, title: row.title })),
          total: result.total,
        };
      },
    };
    const store = Object.assign(db, { getSearch: () => search });

    const detail = getDatabaseViewDetail(store, databaseId, undefined, contentDir, {
      q: "quest",
      limit: 50,
      offset: 0,
    });
    expect(detail?.rowsWindow.total).toBe(1);
    expect(detail?.rows.map((r) => r.nodeId)).toEqual([matchId]);
  });

  test("fixed dyn-sort uses expression index SQL window and orders by value", () => {
    const databaseId = "ZZZZZZZZZZZZZZZZZZZZZZZZZZ";
    const sceneProj = projectionTypeForEndpoint(TEST_PARENTS_CHILDREN_ASSOCIATION_ID, 0);
    writeTableSchema(databaseId, []);
    writeFileSync(
      dynamicPropertiesFilePath(contentDir),
      serializeDynamicPropertiesFile({
        version: 1,
        properties: [
          {
            id: "dyn-scenes",
            owner: databaseId,
            columnKey: "all_scene_count",
            columnName: "All Scene count",
            columnType: "number",
            resolverId: "characters.allSceneCount",
            params: {
              scenes_edge_label: sceneProj,
            },
          },
        ],
        columnSets: [],
      }),
    );
    invalidateDynamicPropertiesCache();

    db.upsertNode(databaseId, { ...typeTableMarkerProperties("Characters") });
    const memberProjection = projectionTypeForEndpoint(TEST_MEMBER_OF_ASSOCIATION_ID, 1);

    const low = "01DYNLOW000000000000000001";
    const high = "01DYNHIGH00000000000000001";
    db.upsertNode(low, { title: "Low scenes" });
    db.upsertNode(high, { title: "High scenes" });
    db.upsertRelationship(low, databaseId, memberProjection, {});
    db.upsertRelationship(high, databaseId, memberProjection, {});

    db.upsertNode("01SCENEA0000000000000000001", { title: "S1" });
    db.upsertNode("01SCENEB0000000000000000001", { title: "S2" });
    db.upsertRelationship(high, "01SCENEA0000000000000000001", sceneProj, {});
    db.upsertRelationship(high, "01SCENEB0000000000000000001", sceneProj, {});
    db.upsertRelationship(low, "01SCENEA0000000000000000001", sceneProj, {});

    const detail = getDatabaseViewDetail(db, databaseId, undefined, contentDir, {
      sorts: [{ column: "all_scene_count", direction: "desc" }],
      limit: 50,
      offset: 0,
    });
    expect(detail?.rowsWindow.total).toBe(2);
    expect(detail?.rows.map((r) => r.nodeId)).toEqual([high, low]);
    expect(detail?.rows[0]?.cells.all_scene_count).toBe("2");
    expect(detail?.rows[1]?.cells.all_scene_count).toBe("1");
    expect(detail?.allColumnDefs?.some((c) => c.key === "all_scene_count" && c.source === "dynamic")).toBe(
      true,
    );

    const digests = db.queryAll<{ digest: string; status: string }>(
      "SELECT digest, status FROM expression_indexes",
    );
    expect(digests.some((row) => row.status === "ready")).toBe(true);

    // Unrelated projection type must not stale the dyn index.
    const readyDigest = digests.find((row) => row.status === "ready")!.digest;
    db.upsertRelationship(low, high, "UNRELATED:0", {});
    expect(db.getExpressionIndexStatus(readyDigest)).toBe("ready");

    // Scene-edge mutation dirties endpoints; re-ensure patches without full wipe of siblings.
    const before = db.queryAll<{ member_id: string; sort_value: number }>(
      "SELECT member_id, sort_value FROM expression_index_values WHERE digest = ? ORDER BY member_id",
      readyDigest,
    );
    expect(before.length).toBe(2);
    db.upsertNode("01SCENEC0000000000000000001", { title: "S3" });
    db.upsertRelationship(low, "01SCENEC0000000000000000001", sceneProj, {});
    expect(db.getExpressionIndexStatus(readyDigest)).toBe("stale");
    const dirty = db.getExpressionIndexDirtyMemberIds(readyDigest);
    expect(dirty?.includes(low)).toBe(true);

    const detailAfter = getDatabaseViewDetail(db, databaseId, undefined, contentDir, {
      sorts: [{ column: "all_scene_count", direction: "desc" }],
      limit: 50,
      offset: 0,
    });
    expect(db.getExpressionIndexStatus(readyDigest)).toBe("ready");
    expect(detailAfter?.rowsWindow.total).toBe(2);
    const byId = new Map(detailAfter?.rows.map((r) => [r.nodeId, r.cells.all_scene_count]));
    expect(byId.get(low)).toBe("2");
    expect(byId.get(high)).toBe("2");
    const after = db.queryAll<{ member_id: string; sort_value: number }>(
      "SELECT member_id, sort_value FROM expression_index_values WHERE digest = ? ORDER BY member_id",
      readyDigest,
    );
    expect(after).toHaveLength(2);
    const highBefore = before.find((r) => r.member_id === high)!;
    const highAfter = after.find((r) => r.member_id === high)!;
    expect(highAfter.sort_value).toBe(highBefore.sort_value);
    const lowAfter = after.find((r) => r.member_id === low)!;
    expect(lowAfter.sort_value).toBe(2);

    writeFileSync(
      dynamicPropertiesFilePath(contentDir),
      serializeDynamicPropertiesFile(emptyDynamicPropertiesFile()),
    );
    invalidateDynamicPropertiesCache();
  });

  test("column-set dyn-sort uses expression index SQL window and orders by value", () => {
    const databaseId = "AAAAAAAAAAAAAAAAAAAAAAAAAA";
    const productId = "01PRODUCTCOLSET000000000001";
    const columnKey = `scene_count__${productId}`;
    const sceneProj = projectionTypeForEndpoint(TEST_PARENTS_CHILDREN_ASSOCIATION_ID, 0);
    const productProj = projectionTypeForEndpoint(TEST_PARENTS_CHILDREN_ASSOCIATION_ID, 1);

    writeTableSchema(databaseId, []);
    writeFileSync(
      dynamicPropertiesFilePath(contentDir),
      serializeDynamicPropertiesFile({
        version: 1,
        properties: [],
        columnSets: [
          {
            id: "dyn-colset-scenes",
            owner: databaseId,
            columnKeyPattern: "scene_count__{productId}",
            columnNamePattern: "{productTitle} Scene count",
            columnType: "number",
            resolverId: "characters.sceneCountByProduct",
            params: {
              scenes_edge_label: sceneProj,
              product_edge_label: productProj,
            },
          },
        ],
      }),
    );
    invalidateDynamicPropertiesCache();

    db.upsertNode(databaseId, { ...typeTableMarkerProperties("Characters") });
    const memberProjection = projectionTypeForEndpoint(TEST_MEMBER_OF_ASSOCIATION_ID, 1);

    const low = "01COLLOW000000000000000001";
    const high = "01COLHIGH00000000000000001";
    db.upsertNode(low, { title: "Low product scenes" });
    db.upsertNode(high, { title: "High product scenes" });
    db.upsertRelationship(low, databaseId, memberProjection, {});
    db.upsertRelationship(high, databaseId, memberProjection, {});

    db.upsertNode(productId, { title: "TWOLD" });
    db.upsertNode("01COLSCEA000000000000000001", { title: "S1" });
    db.upsertNode("01COLSCEB000000000000000001", { title: "S2" });
    db.upsertNode("01COLSCEC000000000000000001", { title: "S3" });

    // high: 2 scenes with product; low: 1 scene with product
    db.upsertRelationship(high, "01COLSCEA000000000000000001", sceneProj, {});
    db.upsertRelationship(high, "01COLSCEB000000000000000001", sceneProj, {});
    db.upsertRelationship(low, "01COLSCEC000000000000000001", sceneProj, {});
    db.upsertRelationship("01COLSCEA000000000000000001", productId, productProj, {});
    db.upsertRelationship("01COLSCEB000000000000000001", productId, productProj, {});
    db.upsertRelationship("01COLSCEC000000000000000001", productId, productProj, {});

    const detail = getDatabaseViewDetail(db, databaseId, undefined, contentDir, {
      sorts: [{ column: columnKey, direction: "desc" }],
      limit: 50,
      offset: 0,
    });
    expect(detail?.rowsWindow.total).toBe(2);
    expect(detail?.rows.map((r) => r.nodeId)).toEqual([high, low]);
    expect(detail?.rows[0]?.cells[columnKey]).toBe("2");
    expect(detail?.rows[1]?.cells[columnKey]).toBe("1");

    const digests = db.queryAll<{ digest: string; status: string }>(
      "SELECT digest, status FROM expression_indexes",
    );
    expect(digests.some((row) => row.status === "ready")).toBe(true);

    writeFileSync(
      dynamicPropertiesFilePath(contentDir),
      serializeDynamicPropertiesFile(emptyDynamicPropertiesFile()),
    );
    invalidateDynamicPropertiesCache();
  });

  test("selects relation cells in window SQL without per-row edge or getNode walks", () => {
    const databaseId = "YYYYYYYYYYYYYYYYYYYYYYYYYY";
    const parentsProjection = projectionTypeForEndpoint(TEST_PARENTS_CHILDREN_ASSOCIATION_ID, 1);
    const childrenProjection = projectionTypeForEndpoint(TEST_PARENTS_CHILDREN_ASSOCIATION_ID, 0);
    writeTableSchema(databaseId, [
      {
        key: "parents",
        name: "Parents",
        type: "relation",
        association: TEST_PARENTS_CHILDREN_ASSOCIATION_ID,
        endpoint: 1,
      },
      {
        key: "children",
        name: "Children",
        type: "relation",
        association: TEST_PARENTS_CHILDREN_ASSOCIATION_ID,
        endpoint: 0,
      },
    ]);
    db.upsertNode(databaseId, { ...typeTableMarkerProperties("Nodes") });
    const memberProjection = projectionTypeForEndpoint(TEST_MEMBER_OF_ASSOCIATION_ID, 1);
    const parent = "01RELPAR000000000000000001";
    const childA = "01RELCHA000000000000000001";
    const childB = "01RELCHB000000000000000001";
    db.upsertNode(parent, { title: "Parent" });
    db.upsertNode(childA, { title: "Child A" });
    db.upsertNode(childB, { title: "Child B" });
    for (const id of [parent, childA, childB]) {
      db.upsertRelationship(id, databaseId, memberProjection, {});
    }
    db.upsertRelationship(parent, childA, childrenProjection, { ordinal: 0 });
    db.upsertRelationship(parent, childB, childrenProjection, { ordinal: 1 });
    db.upsertRelationship(childA, parent, parentsProjection, { ordinal: 0 });
    db.upsertRelationship(childB, parent, parentsProjection, { ordinal: 0 });

    let listFromSourceCalls = 0;
    const originalList = db.listRelationshipsFromSource.bind(db);
    db.listRelationshipsFromSource = ((...args: Parameters<typeof db.listRelationshipsFromSource>) => {
      listFromSourceCalls += 1;
      return originalList(...args);
    }) as typeof db.listRelationshipsFromSource;

    const detail = getDatabaseViewDetail(db, databaseId, undefined, contentDir, {
      limit: 50,
      offset: 0,
      sorts: [{ column: "name", direction: "asc" }],
    });

    db.listRelationshipsFromSource = originalList;

    expect(detail?.rows.find((r) => r.nodeId === parent)).toBeTruthy();
    expect(detail?.rows.find((r) => r.nodeId === childA)).toBeTruthy();
    expect(detail?.rows.find((r) => r.nodeId === childB)).toBeTruthy();
    const parentRow = detail?.rows.find((r) => r.nodeId === parent);
    expect(parentRow?.relationCells?.children).toEqual([
      { targetId: childA, title: "Child A" },
      { targetId: childB, title: "Child B" },
    ]);
    expect(parentRow?.cells.children).toBe("Child A, Child B");
    const childRow = detail?.rows.find((r) => r.nodeId === childA);
    expect(childRow?.relationCells?.parents).toEqual([
      { targetId: parent, title: "Parent" },
    ]);

    // Membership / title reads may call getNode for row names; relation hydrate must not
    // fan out via listRelationshipsFromSource (Select stage owns relation payloads).
    expect(listFromSourceCalls).toBe(0);
  });

  test("refuses unsafe sort and still SQL-windows without full membership load", () => {
    const databaseId = "01FC0SAFE00000000000000001";
    writeTableSchema(databaseId, []);
    db.upsertNode(databaseId, { ...typeTableMarkerProperties("Features") });
    const memberProjection = projectionTypeForEndpoint(TEST_MEMBER_OF_ASSOCIATION_ID, 1);
    for (let i = 0; i < 80; i++) {
      const id = `01FC0MSF${String(i).padStart(18, "0")}`;
      db.upsertNode(id, { title: `Feature ${String(i).padStart(3, "0")}` });
      db.upsertRelationship(id, databaseId, memberProjection, {});
    }

    let listFromSourceCalls = 0;
    const originalList = db.listRelationshipsFromSource.bind(db);
    db.listRelationshipsFromSource = ((...args: Parameters<typeof db.listRelationshipsFromSource>) => {
      listFromSourceCalls += 1;
      return originalList(...args);
    }) as typeof db.listRelationshipsFromSource;

    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const page = getDatabaseViewDetail(db, databaseId, undefined, contentDir, {
        limit: 20,
        offset: 20,
        sorts: [{ column: "bad-key!", direction: "asc" }],
      });
      expect(page?.rowsWindow).toEqual({
        offset: 20,
        limit: 20,
        total: 80,
        hasMore: true,
      });
      expect(page?.rows).toHaveLength(20);
      expect(warn.mock.calls.some((c) => String(c[0]).includes("refused SQL window sort"))).toBe(
        true,
      );
      // Legacy full membership walks set→member edges via listRelationshipsFromSource.
      expect(listFromSourceCalls).toBe(0);
    } finally {
      db.listRelationshipsFromSource = originalList;
      warn.mockRestore();
    }
  });

  test("refuses unresolved dyn sort and still SQL-windows with default order", () => {
    const databaseId = "01FC0NDYN00000000000000001";
    writeTableSchema(databaseId, []);
    writeFileSync(
      dynamicPropertiesFilePath(contentDir),
      serializeDynamicPropertiesFile({
        version: 1,
        properties: [
          {
            id: "dyn-unknown",
            owner: databaseId,
            columnKey: "mystery_score",
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

    db.upsertNode(databaseId, { ...typeTableMarkerProperties("Features") });
    const memberProjection = projectionTypeForEndpoint(TEST_MEMBER_OF_ASSOCIATION_ID, 1);
    const first = "01FC0DYNA00000000000000001";
    const second = "01FC0DYNB00000000000000001";
    db.upsertNode(first, { title: "A first" });
    db.upsertNode(second, { title: "B second" });
    db.upsertRelationship(first, databaseId, memberProjection, {});
    db.upsertRelationship(second, databaseId, memberProjection, {});

    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const detail = getDatabaseViewDetail(db, databaseId, undefined, contentDir, {
        sorts: [{ column: "mystery_score", direction: "desc" }],
        limit: 50,
        offset: 0,
      });
      expect(detail?.rowsWindow.total).toBe(2);
      expect(detail?.rows).toHaveLength(2);
      // Refused dyn → SQL default title/id order (not a JS dyn enrich of the full set).
      expect(detail?.rows.map((r) => r.nodeId)).toEqual([first, second]);
      expect(warn.mock.calls.some((c) => String(c[0]).includes("unresolved dyn"))).toBe(true);
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
