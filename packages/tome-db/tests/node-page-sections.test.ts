import { describe, expect, test, afterAll } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { GraphDatabase } from "../src/graph";
import { MEMBER_OF_TYPE } from "../src/labels";
import { typeTableMarkerProperties } from "../src/node-capabilities";
import { getNodePageDetail } from "../src/node-page-sections";
import { INCLUDES_TYPE } from "../src/includes-relationship";
import { contentModelDir, relationshipTypesFilePath, tableSchemasFilePath } from "../src/content/paths";
import {
  serializeRelationshipTypesFile,
} from "../src/content/relationship-types-file";
import { serializeTableSchemasFile } from "../src/content/table-schemas-file";
import { invalidateRelationshipTypesCache } from "../src/relationship-types/load";
import { invalidateTableSchemasCache } from "../src/table-schemas/load";

function writeMembershipRelationshipTypes(contentDir: string): void {
  writeFileSync(
    relationshipTypesFilePath(contentDir),
    serializeRelationshipTypesFile({
      version: 1,
      types: {
        member_of: {
          bidirectional: true,
          perspectives: ["member_of", "members"],
          perspectiveLabels: {
            member_of: { title: "Membership", linkAdd: "Link type table" },
          },
        },
      },
    }),
  );
  invalidateRelationshipTypesCache();
}

describe("node-sections", () => {
  const dir = mkdtempSync(join(tmpdir(), "tome-db-sections-"));
  const contentDir = join(dir, "content");
  mkdirSync(contentModelDir(contentDir), { recursive: true });
  writeMembershipRelationshipTypes(contentDir);
  process.env.TOME_CONTENT_PATH = contentDir;
  const dbPath = join(dir, "test.sqlite");
  const db = new GraphDatabase(dbPath);

  test("returns markdown as the first section", () => {
    db.upsertNode("page1", {
      title: "Alpha",
      body: "# Notes",
    });

    const detail = getNodePageDetail(db, "page1");
    expect(detail?.sections[0]).toEqual({ type: "markdown", body: "# Notes" });
  });

  test("adds relation sections grouped by edge label with edge properties as columns", () => {
    db.upsertNode("scene1", { title: "Opening", body: "" });
    db.upsertNode("feat1", { title: "Desperation" });
    db.upsertNode("insp1", { title: "Pride and Prejudice" });
    db.upsertRelationship("scene1", "feat1", "features", { ordinal: 0, weight: "strong" });
    db.upsertRelationship("scene1", "insp1", "inspirations", { ordinal: 1 });

    const detail = getNodePageDetail(db, "scene1");
    const relationSections = detail?.sections.filter((section) => section.type === "relations");

    expect(relationSections).toHaveLength(2);
    expect(relationSections?.[0]).toMatchObject({
      type: "relations",
      label: "features",
      title: "Features",
      addMode: "link-existing",
      columns: ["weight"],
      rows: [
        {
          targetId: "feat1",
          name: "Desperation",
          cells: { weight: "strong" },
        },
      ],
    });
    expect(relationSections?.[1]).toMatchObject({
      type: "relations",
      label: "inspirations",
      addMode: "link-existing",
      rows: [{ targetId: "insp1", name: "Pride and Prejudice" }],
    });
  });

  test("sets addMode none on structural one-to-many relation sections", () => {
    db.upsertNode("scene5", { title: "Bridge" });
    db.upsertNode("part1", { title: "The Orphanage" });
    db.upsertRelationship("scene5", "part1", "part", { ordinal: 0 });

    const detail = getNodePageDetail(db, "scene5");
    const partSection = detail?.sections.find(
      (section) => section.type === "relations" && section.label === "part",
    );

    expect(partSection).toMatchObject({
      label: "part",
      addMode: "none",
    });
  });

  test("adds database table section for NotionDatabase records after markdown", () => {
    const databaseId = "db42345678901234567890123456789012";
    db.upsertNode(databaseId, { ...typeTableMarkerProperties("Features DB"), body: "# About" });
    db.upsertNode("page4", { title: "Guest consultant" });
    db.upsertRelationship("page4", databaseId, MEMBER_OF_TYPE, {
      view: "default",
      row_index: 0,
      status: "Partial",
    });

    const detail = getNodePageDetail(db, databaseId);
    expect(detail?.properties).toBeNull();
    expect(detail?.sections.map((section) => section.type)).toEqual(["markdown", "database"]);
    expect(detail?.sections[1]).toMatchObject({
      type: "database",
      databaseView: {
        title: "Features DB",
        rows: [{ nodeId: "page4", name: "Guest consultant", cells: { status: "Partial" } }],
      },
    });
  });

  test("returns null properties when page has no type membership", () => {
    db.upsertNode("page-no-type", { title: "Orphan", body: "" });
    const detail = getNodePageDetail(db, "page-no-type");
    expect(detail?.properties).toBeNull();
  });

  test("shows Properties and member_of relation section on instance pages", () => {
    const databaseId = "db52345678901234567890123456789012";
    db.upsertNode("page5", { title: "Scene A", body: "Prose" });
    db.upsertNode(databaseId, {
      ...typeTableMarkerProperties("Scene Archive"),
      notion_schema: JSON.stringify({
        syncedAt: "test",
        properties: {
          Name: { id: "title", name: "Name", type: "title", config: {} },
          Priority: { id: "Vpkf", name: "Priority", type: "select", config: {} },
        },
      }),
    });
    db.upsertRelationship("page5", databaseId, MEMBER_OF_TYPE, {
      view: "default",
      row_index: 3,
      priority: "High",
    });

    const detail = getNodePageDetail(db, "page5", { contentDir });
    const membership = detail?.sections.find(
      (section) => section.type === "relations" && section.label === MEMBER_OF_TYPE,
    );

    expect(membership).toMatchObject({
      type: "relations",
      label: MEMBER_OF_TYPE,
      title: "Membership",
      typeNodeId: null,
      linkAddLabel: "Link type table",
      addMode: "link-existing",
      columns: [],
      rows: [{ targetId: databaseId, name: "Scene Archive", cells: {} }],
    });
    expect(detail?.properties).toMatchObject({
      type: "properties",
      databaseId,
      typeTitle: "Scene Archive",
      columns: ["priority"],
      columnDefs: [
        {
          key: "priority",
          name: "Priority",
          type: "enum",
          enumId: "priority",
        },
      ],
      cells: { priority: "High" },
    });
  });

  test("shows member_of relation section alongside Properties for legacy membership edges", () => {
    const databaseId = "db62345678901234567890123456789012";
    db.upsertNode("page6", { title: "Legacy row" });
    db.upsertNode(databaseId, {
      ...typeTableMarkerProperties("Legacy Features"),
      notion_schema: JSON.stringify({
        syncedAt: "test",
        properties: {
          Name: { id: "title", name: "Name", type: "title", config: {} },
          Status: { id: "status", name: "Status", type: "select", config: {} },
        },
      }),
    });
    db.upsertRelationship("page6", databaseId, MEMBER_OF_TYPE, { status: "Unresolved" });

    const detail = getNodePageDetail(db, "page6", { contentDir });
    const membership = detail?.sections.find(
      (section) => section.type === "relations" && section.label === MEMBER_OF_TYPE,
    );

    expect(membership).toMatchObject({
      type: "relations",
      label: MEMBER_OF_TYPE,
      title: "Membership",
      typeNodeId: null,
      linkAddLabel: "Link type table",
      addMode: "link-existing",
      rows: [{ targetId: databaseId, name: "Legacy Features" }],
    });
    expect(detail?.properties).toMatchObject({
      databaseId,
      typeTitle: "Legacy Features",
      cells: { status: "Unresolved" },
    });
  });

  test("resolves typeNodeId by matching FEATURES label to NotionDatabase title", () => {
    const featuresTypeId = "f72345678901234567890123456789012";
    db.upsertNode("scene2", { title: "Chase" });
    db.upsertNode(featuresTypeId, { ...typeTableMarkerProperties("Features") });
    db.upsertRelationship("scene2", featuresTypeId, MEMBER_OF_TYPE, { row_index: 0 });
    db.upsertNode("feat2", { title: "Desperation" });
    db.upsertRelationship("scene2", "feat2", "features", { ordinal: 0 });

    const detail = getNodePageDetail(db, "scene2");
    const features = detail?.sections.find(
      (section) => section.type === "relations" && section.label === "features",
    );

    expect(features).toMatchObject({
      title: "Features",
      typeNodeId: featuresTypeId,
    });
  });

  test("resolves typeNodeId by matching NotionDatabase title to relation label", () => {
    const inspTypeId = "f82345678901234567890123456789012";
    db.upsertNode("scene3", { title: "Ball" });
    db.upsertNode(inspTypeId, { ...typeTableMarkerProperties("Inspirations") });
    db.upsertRelationship("scene3", inspTypeId, MEMBER_OF_TYPE, { row_index: 0 });
    db.upsertNode("insp2", { title: "Emma" });
    db.upsertRelationship("scene3", "insp2", "inspirations", { ordinal: 0 });

    const detail = getNodePageDetail(db, "scene3");
    const inspirations = detail?.sections.find(
      (section) => section.type === "relations" && section.label === "inspirations",
    );

    expect(inspirations?.typeNodeId).toBe(inspTypeId);
    expect(inspirations?.title).toBe("Inspirations");
  });

  test("groups multiple member_of parents in one Membership section", () => {
    const typeA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const typeB = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    db.upsertNode("multi-member", { title: "Shared row", body: "" });
    db.upsertNode(typeA, { ...typeTableMarkerProperties("Type A") });
    db.upsertNode(typeB, { ...typeTableMarkerProperties("Type B") });
    db.upsertRelationship("multi-member", typeA, MEMBER_OF_TYPE, { row_index: 0 });
    db.upsertRelationship("multi-member", typeB, MEMBER_OF_TYPE, { row_index: 1 });

    const detail = getNodePageDetail(db, "multi-member", { contentDir });
    const membership = detail?.sections.filter(
      (section) => section.type === "relations" && section.label === MEMBER_OF_TYPE,
    );

    expect(membership).toHaveLength(1);
    expect(membership?.[0]).toMatchObject({
      title: "Membership",
      typeNodeId: null,
      rows: [
        { targetId: typeA, name: "Type A" },
        { targetId: typeB, name: "Type B" },
      ],
    });
  });

  afterAll(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("node-sections table-schema empty relation placeholders", () => {
  const dir = mkdtempSync(join(tmpdir(), "tome-db-sections-table-schema-empty-"));
  const contentDir = join(dir, "content");
  mkdirSync(contentModelDir(contentDir), { recursive: true });
  writeMembershipRelationshipTypes(contentDir);
  writeFileSync(
    tableSchemasFilePath(contentDir),
    serializeTableSchemasFile({
      version: 1,
      tables: {
        "2eea538996934ce8abafc27132e576c1": {
          columns: [
            {
              key: "features",
              name: "Features",
              type: "relation",
              targetTypeId: "dd0de9867cc345b898929306bdf9fc83",
              perspective: "features",
            },
          ],
        },
      },
    }),
  );
  invalidateTableSchemasCache();
  process.env.TOME_CONTENT_PATH = contentDir;
  const dbPath = join(dir, "test.sqlite");
  const db = new GraphDatabase(dbPath);

  const inspirationsTypeId = "2eea538996934ce8abafc27132e576c1";
  const featuresTypeId = "dd0de9867cc345b898929306bdf9fc83";
  const inspirationId = "insp0000000000000000000000000001";
  const featId = "feat0000000000000000000000000001";

  db.upsertNode(inspirationsTypeId, { ...typeTableMarkerProperties("Inspirations") });
  db.upsertNode(featuresTypeId, { ...typeTableMarkerProperties("Features") });
  db.upsertNode(inspirationId, { title: "Dishonored", body: "" });
  db.upsertRelationship(inspirationId, inspirationsTypeId, MEMBER_OF_TYPE, { row_index: 71 });

  test("includes empty relation section from table-schemas when includeSchemaEmptySections is true", () => {
    const detail = getNodePageDetail(db, inspirationId, {
      contentDir,
      includeSchemaEmptySections: true,
    });
    const features = detail?.sections.find(
      (section) => section.type === "relations" && section.label === INCLUDES_TYPE,
    );

    expect(features).toMatchObject({
      type: "relations",
      label: INCLUDES_TYPE,
      title: "Features",
      typeNodeId: featuresTypeId,
      addMode: "link-existing",
      allowedTargetTypeIds: [featuresTypeId],
      columns: [],
      rows: [],
    });
  });

  test("omits table-schema-only relation section by default", () => {
    const detail = getNodePageDetail(db, inspirationId, { contentDir });
    const features = detail?.sections.find(
      (section) => section.type === "relations" && section.label === INCLUDES_TYPE,
    );
    expect(features).toBeUndefined();
  });

  test("does not duplicate section when features link already exists", () => {
    db.upsertNode(featId, { title: "Desperation" });
    db.upsertRelationship(featId, featuresTypeId, MEMBER_OF_TYPE, { row_index: 0 });
    db.upsertRelationship(inspirationId, featId, INCLUDES_TYPE, { ordinal: 0 });

    const detail = getNodePageDetail(db, inspirationId, {
      contentDir,
      includeSchemaEmptySections: true,
    });
    const featuresSections = detail?.sections.filter(
      (section) => section.type === "relations" && section.label === INCLUDES_TYPE,
    );

    expect(featuresSections).toHaveLength(1);
    expect(featuresSections?.[0]).toMatchObject({
      title: "Features",
      rows: [{ targetId: featId, name: "Desperation" }],
    });
  });

  afterAll(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("node-sections bible passages regression", () => {
  const dir = mkdtempSync(join(tmpdir(), "tome-db-sections-bible-"));
  const contentDir = join(dir, "content");
  mkdirSync(contentModelDir(contentDir), { recursive: true });
  const dbPath = join(dir, "test.sqlite");
  const db = new GraphDatabase(dbPath);

  const biblePassagesId = "28358e628ba280889942da28069b6dbc";
  const memberId = "7bbfdc05d5474f3d948274b485060fdc";
  const featuresTypeId = "dd0de9867cc345b898929306bdf9fc83";

  writeFileSync(
    tableSchemasFilePath(contentDir),
    serializeTableSchemasFile({
      version: 1,
      tables: {
        [biblePassagesId]: {
          columns: [
            {
              key: "features",
              name: "Features",
              type: "relation",
              targetTypeId: featuresTypeId,
              perspective: "features",
            },
            { key: "verses", name: "Verses", type: "rich_text" },
          ],
        },
      },
    }),
  );
  invalidateTableSchemasCache();
  writeMembershipRelationshipTypes(contentDir);
  process.env.TOME_CONTENT_PATH = contentDir;

  test("member row shows Verses in Properties and Bible passages in member_of section", () => {
    db.upsertNode(biblePassagesId, { ...typeTableMarkerProperties("Bible passages") });
    db.upsertNode(memberId, { title: "Men gather to David", body: "> 1 Samuel 22:2" });
    db.upsertRelationship(memberId, biblePassagesId, MEMBER_OF_TYPE, {
      view: "Untitled",
      row_index: 20,
    });

    const detail = getNodePageDetail(db, memberId, { contentDir });

    expect(detail?.properties).toMatchObject({
      type: "properties",
      databaseId: biblePassagesId,
      typeTitle: "Bible passages",
      columns: ["verses"],
      cells: {},
    });

    const membership = detail?.sections.find(
      (section) => section.type === "relations" && section.label === MEMBER_OF_TYPE,
    );
    expect(membership).toMatchObject({
      type: "relations",
      label: MEMBER_OF_TYPE,
      title: "Membership",
      typeNodeId: null,
      linkAddLabel: "Link type table",
      addMode: "link-existing",
      columns: [],
      rows: [{ targetId: biblePassagesId, name: "Bible passages", cells: {} }],
    });
  });

  afterAll(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
