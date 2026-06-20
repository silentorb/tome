import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { GraphDatabase } from "../src/graph";
import { IS_A_TYPE } from "../src/labels";
import { typeTableMarkerProperties } from "../src/node-capabilities";
import { getDatabaseViewDetail } from "../src/database-view";
import { sortEvalRows, type EvalRow } from "../src/row-sort";
import { serializeViewsFile, VIEWS_FILE_VERSION } from "../src/content/views-file";
import { serializeDynamicFieldsFile, emptyDynamicFieldsFile } from "../src/content/dynamic-fields-file";
import {
  contentModelDir,
  viewsFilePath,
  dynamicFieldsFilePath,
  tableSchemasFilePath,
} from "../src/content/paths";
import { serializeTableSchemasFile } from "../src/content/table-schemas-file";

describe("row-sort", () => {
  const rows: EvalRow[] = [
    { nodeId: "a", name: "Alpha", cells: { status: "Done" }, rowIndex: 0, createdAt: null, modifiedAt: null },
    { nodeId: "b", name: "Beta", cells: { status: "Todo" }, rowIndex: 1, createdAt: null, modifiedAt: null },
  ];

  test("sorts by property ascending", () => {
    const sorted = sortEvalRows(rows, [{ property: "status", direction: "ascending" }]);
    expect(sorted.map((r) => r.nodeId)).toEqual(["a", "b"]);
  });

  test("sorts by title using row name when rowIndex order differs", () => {
    const unsorted: EvalRow[] = [
      { nodeId: "z", name: "Zebra", cells: {}, rowIndex: 0, createdAt: null, modifiedAt: null },
      { nodeId: "a", name: "Alpha", cells: {}, rowIndex: 1, createdAt: null, modifiedAt: null },
    ];
    const sorted = sortEvalRows(unsorted, [{ property: "title", direction: "ascending" }]);
    expect(sorted.map((r) => r.name)).toEqual(["Alpha", "Zebra"]);
  });

  test("sorts priority by options index, not alphabetically", () => {
    const unsorted: EvalRow[] = [
      { nodeId: "m", name: "Medium item", cells: { priority: "Medium" }, rowIndex: 0, createdAt: null, modifiedAt: null },
      { nodeId: "h", name: "High item", cells: { priority: "High" }, rowIndex: 1, createdAt: null, modifiedAt: null },
      { nodeId: "l", name: "Low item", cells: { priority: "Low" }, rowIndex: 2, createdAt: null, modifiedAt: null },
    ];
    const sorted = sortEvalRows(unsorted, [{ property: "Priority", direction: "descending" }]);
    expect(sorted.map((r) => r.name)).toEqual(["High item", "Medium item", "Low item"]);
  });

  test("sorts relation fields by link count descending", () => {
    const unsorted: EvalRow[] = [
      {
        nodeId: "few",
        name: "Few links",
        cells: { inspirations: "Alpha, Beta" },
        relationCells: {
          inspirations: [
            { targetId: "a", title: "Alpha" },
            { targetId: "b", title: "Beta" },
          ],
        },
        rowIndex: 0,
        createdAt: null,
        modifiedAt: null,
      },
      {
        nodeId: "many",
        name: "Many links",
        cells: { inspirations: "One, Two, Three" },
        relationCells: {
          inspirations: [
            { targetId: "1", title: "One" },
            { targetId: "2", title: "Two" },
            { targetId: "3", title: "Three" },
          ],
        },
        rowIndex: 1,
        createdAt: null,
        modifiedAt: null,
      },
      {
        nodeId: "none",
        name: "No links",
        cells: {},
        relationCells: { inspirations: [] },
        rowIndex: 2,
        createdAt: null,
        modifiedAt: null,
      },
    ];
    const sorted = sortEvalRows(unsorted, [{ property: "inspirations", direction: "descending" }]);
    expect(sorted.map((r) => r.name)).toEqual(["Many links", "Few links", "No links"]);
  });
});

describe("getDatabaseViewDetail with custom tabs", () => {
  test("uses views.json tab sorts and shows all schema columns", () => {
    const dir = mkdtempSync(join(tmpdir(), "tome-db-view-tabs-"));
    const contentDir = join(dir, "content");
    mkdirSync(contentModelDir(contentDir), { recursive: true });
    const db = new GraphDatabase(join(dir, "test.sqlite"), { clean: true });
    const databaseId = "dddddddddddddddddddddddddddddddd";

    writeFileSync(
      viewsFilePath(contentDir),
      serializeViewsFile({
        version: VIEWS_FILE_VERSION,
        nodes: {
          [databaseId]: {
            sections: {
              items: {
                tabs: {
                  kind: "custom",
                  definitions: [
                    {
                      id: "done-only",
                      name: "Done only",
                      sorts: [{ column: "name", direction: "asc" }],
                    },
                  ],
                },
              },
            },
          },
        },
      }),
    );
    writeFileSync(
      dynamicFieldsFilePath(contentDir),
      serializeDynamicFieldsFile(emptyDynamicFieldsFile()),
    );

    writeFileSync(
      tableSchemasFilePath(contentDir),
      serializeTableSchemasFile({
        version: 1,
        tables: {
          [databaseId]: {
            columns: [{ key: "status", name: "Status", type: "select" }],
          },
        },
      }),
    );
    db.upsertNode(databaseId, { ...typeTableMarkerProperties("Tasks") });
    db.upsertNode("page1", { title: "Zebra" });
    db.upsertNode("page2", { title: "Alpha" });
    db.upsertRelationship("page1", databaseId, IS_A_TYPE, { status: "Done", row_index: 0 });
    db.upsertRelationship("page2", databaseId, IS_A_TYPE, { status: "Todo", row_index: 1 });

    const view = getDatabaseViewDetail(db, databaseId, undefined, contentDir);
    expect(view?.tabs.items.map((tab) => tab.label)).toEqual(["Done only"]);
    expect(view?.rows).toHaveLength(2);
    expect(view?.rows.map((row) => row.name)).toEqual(["Alpha", "Zebra"]);
    expect(view?.columnDefs?.some((col) => col.key === "status")).toBe(true);

    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("applies section columnOrder override from views.json", () => {
    const dir = mkdtempSync(join(tmpdir(), "tome-db-view-cols-"));
    const contentDir = join(dir, "content");
    mkdirSync(contentModelDir(contentDir), { recursive: true });
    const db = new GraphDatabase(join(dir, "test.sqlite"), { clean: true });
    const databaseId = "dddddddddddddddddddddddddddddddd";

    writeFileSync(
      viewsFilePath(contentDir),
      serializeViewsFile({
        version: VIEWS_FILE_VERSION,
        nodes: {
          [databaseId]: {
            sections: {
              items: {
                columnOrder: ["status"],
                tabs: {
                  kind: "custom",
                  definitions: [
                    {
                      id: "all",
                      name: "All",
                      sorts: [{ column: "name", direction: "asc" }],
                    },
                  ],
                },
              },
            },
          },
        },
      }),
    );
    writeFileSync(
      dynamicFieldsFilePath(contentDir),
      serializeDynamicFieldsFile(emptyDynamicFieldsFile()),
    );

    writeFileSync(
      tableSchemasFilePath(contentDir),
      serializeTableSchemasFile({
        version: 1,
        tables: {
          [databaseId]: {
            columns: [
              { key: "status", name: "Status", type: "select" },
              { key: "priority", name: "Priority", type: "select", enumId: "priority" },
            ],
          },
        },
      }),
    );
    db.upsertNode(databaseId, { ...typeTableMarkerProperties("Tasks") });
    db.upsertNode("page1", { title: "Row" });
    db.upsertRelationship("page1", databaseId, IS_A_TYPE, { row_index: 0 });

    const view = getDatabaseViewDetail(db, databaseId, undefined, contentDir);
    expect(view?.columns).toEqual(["status", "priority"]);

    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("sorts relation columns by link count using tab sorts", () => {
    const dir = mkdtempSync(join(tmpdir(), "tome-db-view-rel-sort-"));
    const contentDir = join(dir, "content");
    mkdirSync(contentModelDir(contentDir), { recursive: true });
    const db = new GraphDatabase(join(dir, "test.sqlite"), { clean: true });
    const featuresDb = "dd0de9867cc345b898929306bdf9fc83";
    const inspirationsDb = "2eea538996934ce8abafc27132e576c1";

    writeFileSync(
      viewsFilePath(contentDir),
      serializeViewsFile({
        version: VIEWS_FILE_VERSION,
        nodes: {
          [featuresDb]: {
            sections: {
              items: {
                tabs: {
                  kind: "custom",
                  definitions: [
                    {
                      id: "by-inspirations",
                      name: "By inspirations",
                      sorts: [{ column: "inspirations", direction: "desc" }],
                    },
                  ],
                },
              },
            },
          },
        },
      }),
    );
    writeFileSync(
      dynamicFieldsFilePath(contentDir),
      serializeDynamicFieldsFile(emptyDynamicFieldsFile()),
    );
    writeFileSync(
      tableSchemasFilePath(contentDir),
      serializeTableSchemasFile({
        version: 1,
        tables: {
          [featuresDb]: {
            columns: [
              {
                key: "inspirations",
                name: "Inspirations",
                type: "relation",
                targetTypeId: inspirationsDb,
                perspective: "inspirations",
              },
            ],
          },
        },
      }),
    );

    db.upsertNode(featuresDb, { ...typeTableMarkerProperties("Features") });
    db.upsertNode(inspirationsDb, { ...typeTableMarkerProperties("Inspirations") });
    db.upsertNode("feature-few", { title: "Few inspirations" });
    db.upsertNode("feature-many", { title: "Many inspirations" });
    db.upsertNode("feature-none", { title: "No inspirations" });
    db.upsertNode("insp-a", { title: "Insp A" });
    db.upsertNode("insp-b", { title: "Insp B" });
    db.upsertNode("insp-c", { title: "Insp C" });

    db.upsertRelationship("feature-few", featuresDb, IS_A_TYPE, { row_index: 0 });
    db.upsertRelationship("feature-many", featuresDb, IS_A_TYPE, { row_index: 1 });
    db.upsertRelationship("feature-none", featuresDb, IS_A_TYPE, { row_index: 2 });
    db.upsertRelationship("insp-a", inspirationsDb, IS_A_TYPE, { row_index: 0 });
    db.upsertRelationship("insp-b", inspirationsDb, IS_A_TYPE, { row_index: 1 });
    db.upsertRelationship("insp-c", inspirationsDb, IS_A_TYPE, { row_index: 2 });
    db.upsertRelationship("feature-few", "insp-a", "includes");
    db.upsertRelationship("feature-few", "insp-b", "includes");
    db.upsertRelationship("feature-many", "insp-a", "includes");
    db.upsertRelationship("feature-many", "insp-b", "includes");
    db.upsertRelationship("feature-many", "insp-c", "includes");

    const view = getDatabaseViewDetail(db, featuresDb, "by-inspirations", contentDir);
    expect(view?.rows.map((row) => row.name)).toEqual([
      "Many inspirations",
      "Few inspirations",
      "No inspirations",
    ]);
    expect(view?.rows[2]?.relationCells?.inspirations).toEqual([]);

    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
