import { describe, expect, test, afterAll } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { GraphDatabase } from "../src/graph";
import { typeTableMarkerProperties } from "../src/node-capabilities";
import { getDatabaseViewDetail } from "../src/database-view";
import {
  contentModelDir,
  dynamicFieldsFilePath,
  relationshipTypesFilePath,
  schemaFilePath,
  tableSchemasFilePath,
} from "../src/content/paths";
import { emptyDynamicFieldsFile, serializeDynamicFieldsFile } from "../src/content/dynamic-fields-file";
import { serializeTableSchemasFile } from "../src/content/table-schemas-file";
import { serializeSchemaFile } from "../src/schema-rules/schema-file";
import { serializeRelationshipTypesFile } from "../src/content/relationship-types-file";
import { invalidateRelationshipTypesCache } from "../src/relationship-types/load";
import { invalidateSchemaCache } from "../src/schema-rules/load";
import { invalidateTableSchemasCache } from "../src/table-schemas/load";

describe("database-view", () => {
  const dir = mkdtempSync(join(tmpdir(), "tome-db-view-"));
  const contentDir = join(dir, "content");
  mkdirSync(contentModelDir(contentDir), { recursive: true });
  writeFileSync(
    dynamicFieldsFilePath(contentDir),
    serializeDynamicFieldsFile(emptyDynamicFieldsFile()),
  );
  writeFileSync(
    relationshipTypesFilePath(contentDir),
    serializeRelationshipTypesFile({
      version: 1,
      types: {
        member_of: {
          perspectives: ["members", "member_of"],
          traits: ["set"],
        },
        ordered_member_of: {
          perspectives: ["ordered_members", "ordered_member_of"],
          traits: ["set", "ordered"],
        },
        parents_children: {
          perspectives: ["children", "parents"],
        },
      },
    }),
  );
  invalidateRelationshipTypesCache();
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
    membershipComposite?: string,
  ): void {
    writeFileSync(
      tableSchemasFilePath(contentDir),
      serializeTableSchemasFile({
        version: 1,
        tables: {
          [databaseId]: {
            ...(membershipComposite ? { membershipComposite } : {}),
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
    db.upsertRelationship("page1", databaseId, "member_of", {
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
    db.upsertRelationship("page2", databaseId, "member_of", {
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
        relationshipType: "parents_children",
      },
    ]);
    db.upsertNode(databaseId, { ...typeTableMarkerProperties("Features") });
    db.upsertNode("page3", { title: "Child feature" });
    db.upsertNode(parentId, { title: "Parent feature" });
    db.upsertRelationship("page3", databaseId, "member_of", { row_index: 0 });
    db.upsertRelationship("page3", parentId, "parents", { ordinal: 0 });

    const detail = getDatabaseViewDetail(db, databaseId, undefined, contentDir);
    expect(detail?.rows[0]?.cells.parents).toBe("Parent feature");
    expect(detail?.columnDefs?.[0]).toMatchObject({
      type: "relation",
      relationType: "parents",
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
    db.upsertRelationship("insp1", databaseId, "member_of", {
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
      relationshipTypesFilePath(contentDir),
      serializeRelationshipTypesFile({
        version: 1,
        types: {
          custom_set: {
            perspectives: ["cohort", "belongs_to_cohort"],
            traits: ["set"],
          },
          parents_children: {
            perspectives: ["children", "parents"],
          },
        },
      }),
    );
    invalidateRelationshipTypesCache();
    writeTableSchema(databaseId, [], "custom_set");
    db.upsertNode(databaseId, { ...typeTableMarkerProperties("Cohorts") });
    db.upsertNode("member1", { title: "Member one" });
    db.upsertRelationship("member1", databaseId, "belongs_to_cohort", { row_index: 0 });

    const detail = getDatabaseViewDetail(db, databaseId, undefined, contentDir);
    expect(detail).toMatchObject({
      viewRelationshipType: "cohort",
      memberSidePerspective: "belongs_to_cohort",
      rows: [{ nodeId: "member1", name: "Member one" }],
    });

    // Restore conventional set types for later tests in this file.
    writeFileSync(
      relationshipTypesFilePath(contentDir),
      serializeRelationshipTypesFile({
        version: 1,
        types: {
          member_of: {
            perspectives: ["members", "member_of"],
            traits: ["set"],
          },
          ordered_member_of: {
            perspectives: ["ordered_members", "ordered_member_of"],
            traits: ["set", "ordered"],
          },
          parents_children: {
            perspectives: ["children", "parents"],
          },
        },
      }),
    );
    invalidateRelationshipTypesCache();
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
