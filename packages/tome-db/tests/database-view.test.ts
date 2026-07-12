import { TEST_MEMBER_OF_ASSOCIATION_ID, TEST_PARENTS_CHILDREN_ASSOCIATION_ID } from "../src/content/test-helpers";
import { describe, expect, test, afterAll } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { GraphDatabase } from "tome-sqlite";
import { typeTableMarkerProperties } from "../src/node-capabilities";
import { getDatabaseViewDetail } from "../src/database-view";
import { contentModelDir,
  dynamicFieldsFilePath,
  associationsFilePath,
  schemaFilePath,
  tableSchemasFilePath, projectionTypeForEndpoint } from "tome-flatfile";
import { emptyDynamicFieldsFile, serializeDynamicFieldsFile } from "tome-flatfile";
import { serializeTableSchemasFile } from "tome-flatfile";
import { serializeSchemaFile } from "tome-flatfile";
import { serializeAssociationsFile } from "tome-flatfile";
import { invalidateAssociationsCache } from "tome-flatfile";
import { invalidateSchemaCache } from "tome-flatfile";
import { invalidateTableSchemasCache } from "tome-flatfile";

describe("database-view", () => {
  const dir = mkdtempSync(join(tmpdir(), "tome-db-view-"));
  const contentDir = join(dir, "content");
  mkdirSync(contentModelDir(contentDir), { recursive: true });
  writeFileSync(
    dynamicFieldsFilePath(contentDir),
    serializeDynamicFieldsFile(emptyDynamicFieldsFile()),
  );
  writeFileSync(
    associationsFilePath(contentDir),
    serializeAssociationsFile({
      version: 1,
      associations: {
        "000000000000000000000000A1": {
          perspectives: ["Members", "Membership"],
          traits: ["set"],
        },
        "000000000000000000000000A2": {
          perspectives: ["Ordered members", "Ordered membership"],
          traits: ["set", "ordered"],
        },
        "000000000000000000000000B1": {
          perspectives: ["Children", "Parents"],
        },
      },
    }),
  );
  invalidateAssociationsCache();
  const dbPath = join(dir, "test.sqlite");
  const db = new GraphDatabase(dbPath);

  function writeSchema(
    enums: Record<
      string,
      { options: string[]; default: string; defaultOrder?: "asc" | "desc" }
    >,
  ): void {
    writeFileSync(
      schemaFilePath(contentDir),
      serializeSchemaFile({
        version: 1,
        relationshipRules: [],
        enums: Object.fromEntries(
          Object.entries(enums).map(([id, def]) => [
            id,
            { defaultOrder: "asc" as const, ...def },
          ]),
        ),
      }),
    );
    invalidateSchemaCache();
  }

  function writeTableSchema(
    databaseId: string,
    columns: Parameters<typeof serializeTableSchemasFile>[0]["tables"][string]["columns"],
  ): void {
    writeFileSync(
      tableSchemasFilePath(contentDir),
      serializeTableSchemasFile({
        version: 1,
        tables: {
          [databaseId]: {
            columns,
          },
        },
      }),
    );
    invalidateTableSchemasCache();
  }

  test("returns null for non-database vertices", () => {
    db.upsertNode("page1", { title: "Alpha" });
    expect(getDatabaseViewDetail(db, "page1", undefined, contentDir)).toBeNull();
  });

  test("reads IS_A edges for a view", () => {
    const databaseId = "AAAAAAAAAAAAAAAAAAAAAAAAAA";
    writeTableSchema(databaseId, [
      { key: "priority", name: "Priority", type: "select", enumId: "priority" },
    ]);
    db.upsertNode(databaseId, { ...typeTableMarkerProperties("Features") });
    db.upsertNode("page1", { title: "Desperation" });
    db.upsertRelationship("page1", databaseId, projectionTypeForEndpoint(TEST_MEMBER_OF_ASSOCIATION_ID, 1), {
      view: "all",
      priority: "High",
    });

    const detail = getDatabaseViewDetail(db, databaseId, "all", contentDir);
    expect(detail).toMatchObject({
      id: databaseId,
      title: "Features",
      views: ["all"],
      view: "all",
      tabs: {
        kind: "custom",
        items: [{ id: "all", label: "all", kind: "custom" }],
        activeTabId: "all",
      },
      columns: ["priority"],
      rows: [
        {
          rowIndex: 0,
          nodeId: "page1",
          name: "Desperation",
          cells: { priority: "High" },
        },
      ],
    });
    expect(detail?.columnDefs?.[0]).toMatchObject({
      key: "priority",
      type: "enum",
    });
  });

  test("derives row name from linked page title, not edge row_name", () => {
    const databaseId = "BBBBBBBBBBBBBBBBBBBBBBBBBB";
    writeTableSchema(databaseId, []);
    db.upsertNode(databaseId, { ...typeTableMarkerProperties("Features") });
    db.upsertNode("page2", { title: "Peace in the eye of the storm" });
    db.upsertRelationship("page2", databaseId, projectionTypeForEndpoint(TEST_MEMBER_OF_ASSOCIATION_ID, 1), {
      view: "default",
      row_index: 0,
      row_name: "Stale CSV label",
    });

    const detail = getDatabaseViewDetail(db, databaseId, undefined, contentDir);
    expect(detail?.rows[0]?.name).toBe("Peace in the eye of the storm");
  });

  test("hydrates relation columns from row is_a membership", () => {
    const databaseId = "CCCCCCCCCCCCCCCCCCCCCCCCCC";
    const parentId = "DDDDDDDDDDDDDDDDDDDDDDDDDD";
    writeTableSchema(databaseId, [
      {
        key: "parents",
        name: "Parents",
        type: "relation",
        association: "000000000000000000000000B1",
      },
    ]);
    db.upsertNode(databaseId, { ...typeTableMarkerProperties("Features") });
    db.upsertNode("page3", { title: "Child feature" });
    db.upsertNode(parentId, { title: "Parent feature" });
    db.upsertRelationship("page3", databaseId, projectionTypeForEndpoint(TEST_MEMBER_OF_ASSOCIATION_ID, 1), { row_index: 0 });
    db.upsertRelationship("page3", parentId, projectionTypeForEndpoint(TEST_PARENTS_CHILDREN_ASSOCIATION_ID, 1), { ordinal: 0 });

    const detail = getDatabaseViewDetail(db, databaseId, undefined, contentDir);
    expect(detail?.rows[0]?.cells.parents).toBe("Parent feature");
    expect(detail?.columnDefs?.[0]).toMatchObject({
      type: "relation",
      relationType: projectionTypeForEndpoint(TEST_PARENTS_CHILDREN_ASSOCIATION_ID, 1),
    });
    expect(detail?.rows[0]?.relationCells?.parents).toEqual([
      { targetId: parentId, title: "Parent feature" },
    ]);
  });

  test("enriches select column with explicit enumId to editable enum metadata", () => {
    const databaseId = "0000000000000000000000000K";
    writeSchema({
      yes_no: { options: ["False", "True"], default: "False" },
    });
    writeTableSchema(databaseId, [
      {
        key: "plot_is_driven_by_mc_desire",
        name: "Plot is driven by MC desire",
        type: "select",
        enumId: "yes_no",
      },
    ]);
    db.upsertNode(databaseId, { ...typeTableMarkerProperties("Inspirations") });
    db.upsertNode("insp1", { title: "Example inspiration" });
    db.upsertRelationship("insp1", databaseId, projectionTypeForEndpoint(TEST_MEMBER_OF_ASSOCIATION_ID, 1), {
      row_index: 0,
      plot_is_driven_by_mc_desire: "True",
    });

    const detail = getDatabaseViewDetail(db, databaseId, undefined, contentDir);
    expect(detail?.columnDefs?.[0]).toMatchObject({
      key: "plot_is_driven_by_mc_desire",
      type: "enum",
      enumId: "yes_no",
      options: ["False", "True"],
      defaultValue: "False",
    });
    expect(detail?.rows[0]?.cells.plot_is_driven_by_mc_desire).toBe("True");
  });

  test("exposes set membership perspectives from a non-conventional composite", () => {
    const databaseId = "FFFFFFFFFFFFFFFFFFFFFFFFFF";
    writeFileSync(
      associationsFilePath(contentDir),
      serializeAssociationsFile({
        version: 1,
        associations: {
          "000000000000000000000000B6": {
            perspectives: ["cohort", "belongs_to_cohort"],
            traits: ["set"],
          },
          "000000000000000000000000B1": {
            perspectives: ["Children", "Parents"],
          },
        },
      }),
    );
    invalidateAssociationsCache();
    writeTableSchema(databaseId, []);
    db.upsertNode(databaseId, { ...typeTableMarkerProperties("Cohorts") });
    db.upsertNode("member1", { title: "Member one" });
    db.upsertRelationship("member1", databaseId, projectionTypeForEndpoint("000000000000000000000000B6", 1), { row_index: 0 });

    const detail = getDatabaseViewDetail(db, databaseId, undefined, contentDir);
    expect(detail).toMatchObject({
      viewAssociation: "000000000000000000000000B6",
      memberSidePerspective: projectionTypeForEndpoint("000000000000000000000000B6", 1),
      rows: [{ nodeId: "member1", name: "Member one" }],
    });

    // Restore conventional set types for later tests in this file.
    writeFileSync(
      associationsFilePath(contentDir),
      serializeAssociationsFile({
        version: 1,
        associations: {
          "000000000000000000000000A1": {
            perspectives: ["Members", "Membership"],
            traits: ["set"],
          },
          "000000000000000000000000A2": {
            perspectives: ["Ordered members", "Ordered membership"],
            traits: ["set", "ordered"],
          },
          "000000000000000000000000B1": {
            perspectives: ["Children", "Parents"],
          },
        },
      }),
    );
    invalidateAssociationsCache();
  });

  test("ignores orphan_row properties on the database vertex", () => {
    const databaseId = "EEEEEEEEEEEEEEEEEEEEEEEEEE";
    writeTableSchema(databaseId, []);
    db.upsertNode(databaseId, { ...typeTableMarkerProperties("Tasks") });
    db.mergeNodeProperties(databaseId, {
      orphan_row_default_0: JSON.stringify({
        row_name: "Fix import",
        status: "Open",
      }),
    });

    const detail = getDatabaseViewDetail(db, databaseId, undefined, contentDir);
    expect(detail?.rows).toEqual([]);
  });

  afterAll(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
