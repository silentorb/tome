import { describe, expect, test, afterAll } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { GraphDatabase } from "tome-cache-sqlite";
import { typeTableMarkerProperties } from "../src/node-capabilities";
import { getNodePageDetail } from "../src/node-page-sections";
import { contentModelDir, relationshipTypesFilePath, tableSchemasFilePath } from "tome-store-flatfile";
import {
  serializeRelationshipTypesFile,
} from "tome-store-flatfile";
import { serializeTableSchemasFile } from "tome-store-flatfile";
import { invalidateRelationshipTypesCache } from "tome-store-flatfile";
import { invalidateTableSchemasCache } from "tome-store-flatfile";

function writeMembershipRelationshipTypes(contentDir: string): void {
  writeFileSync(
    relationshipTypesFilePath(contentDir),
    serializeRelationshipTypesFile({
      version: 1,
      types: {
        member_of: {
          perspectives: ["members", "member_of"],
          traits: ["set"],
          perspectiveLabels: {
            member_of: { title: "Membership", linkAdd: "Link type table" },
          },
        },
        inspirations_features: {
          perspectives: ["features", "inspirations"],
        },
        scenes_part: {
          perspectives: ["scenes", "part"],
        },
      },
    }),
  );
  invalidateRelationshipTypesCache();
}

function writeInspirationsFeaturesRelationshipTypes(
  contentDir: string,
  inspirationsTypeId: string,
  featuresTypeId: string,
): void {
  writeFileSync(
    relationshipTypesFilePath(contentDir),
    serializeRelationshipTypesFile({
      version: 1,
      types: {
        member_of: {
          perspectives: ["members", "member_of"],
          traits: ["set"],
          perspectiveLabels: {
            member_of: { title: "Membership", linkAdd: "Link type table" },
          },
        },
        inspirations_features: {
          perspectives: ["features", "inspirations"],
          endpoints: {
            0: { typeId: featuresTypeId },
            1: { typeId: inspirationsTypeId },
          },
        },
      },
    }),
  );
  invalidateRelationshipTypesCache();
}

function writeFeaturesBiblePassagesRelationshipTypes(
  contentDir: string,
  biblePassagesTypeId: string,
  featuresTypeId: string,
): void {
  writeFileSync(
    relationshipTypesFilePath(contentDir),
    serializeRelationshipTypesFile({
      version: 1,
      types: {
        member_of: {
          perspectives: ["members", "member_of"],
          traits: ["set"],
          perspectiveLabels: {
            member_of: { title: "Membership", linkAdd: "Link type table" },
          },
        },
        features_bible_passages: {
          perspectives: ["features", "bible_passages"],
          endpoints: {
            0: { typeId: featuresTypeId },
            1: { typeId: biblePassagesTypeId },
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

  test("defaults addMode link-existing on part relation sections", () => {
    db.upsertNode("scene5", { title: "Bridge" });
    db.upsertNode("part1", { title: "The Orphanage" });
    db.upsertRelationship("scene5", "part1", "part", { ordinal: 0 });

    const detail = getNodePageDetail(db, "scene5", { contentDir });
    const partSection = detail?.sections.find(
      (section) => section.type === "relations" && section.label === "part",
    );

    expect(partSection).toMatchObject({
      label: "part",
      addMode: "link-existing",
    });
  });

  test("honors registry linkExisting false on relation sections", () => {
    writeFileSync(
      relationshipTypesFilePath(contentDir),
      serializeRelationshipTypesFile({
        version: 1,
        types: {
          member_of: {
            perspectives: ["members", "member_of"],
            traits: ["set"],
            perspectiveLabels: {
              member_of: { title: "Membership", linkAdd: "Link type table" },
            },
          },
          inspirations_features: {
            perspectives: ["features", "inspirations"],
          },
          scenes_part: {
            perspectives: ["scenes", "part"],
            linkExisting: false,
          },
        },
      }),
    );
    invalidateRelationshipTypesCache();

    db.upsertNode("scene6", { title: "Harbor" });
    db.upsertNode("part2", { title: "Act II" });
    db.upsertRelationship("scene6", "part2", "part", { ordinal: 0 });

    const detail = getNodePageDetail(db, "scene6", { contentDir });
    const partSection = detail?.sections.find(
      (section) => section.type === "relations" && section.label === "part",
    );

    expect(partSection).toMatchObject({
      label: "part",
      addMode: "none",
    });

    writeMembershipRelationshipTypes(contentDir);
  });

  test("adds database table section for type-table records after markdown", () => {
    const databaseId = "db42345678901234567890123456789012";
    db.upsertNode(databaseId, { ...typeTableMarkerProperties("Features DB"), body: "# About" });
    db.upsertNode("page4", { title: "Guest consultant" });
    db.upsertRelationship("page4", databaseId, "member_of", {
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
    });
    db.upsertRelationship("page5", databaseId, "member_of", {
      view: "default",
      priority: "High",
    });

    const detail = getNodePageDetail(db, "page5", { contentDir });
    const membership = detail?.sections.find(
      (section) => section.type === "relations" && section.label === "member_of",
    );

    expect(membership).toMatchObject({
      type: "relations",
      label: "member_of",
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
    });
    db.upsertRelationship("page6", databaseId, "member_of", { status: "Unresolved" });

    const detail = getNodePageDetail(db, "page6", { contentDir });
    const membership = detail?.sections.find(
      (section) => section.type === "relations" && section.label === "member_of",
    );

    expect(membership).toMatchObject({
      type: "relations",
      label: "member_of",
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

  test("resolves typeNodeId by matching FEATURES label to type-table title", () => {
    const featuresTypeId = "f72345678901234567890123456789012";
    db.upsertNode("scene2", { title: "Chase" });
    db.upsertNode(featuresTypeId, { ...typeTableMarkerProperties("Features") });
    db.upsertRelationship("scene2", featuresTypeId, "member_of", { row_index: 0 });
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

  test("resolves typeNodeId by matching type-table title to relation label", () => {
    const inspTypeId = "f82345678901234567890123456789012";
    db.upsertNode("scene3", { title: "Ball" });
    db.upsertNode(inspTypeId, { ...typeTableMarkerProperties("Inspirations") });
    db.upsertRelationship("scene3", inspTypeId, "member_of", { row_index: 0 });
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
    const typeA = "AAAAAAAAAAAAAAAAAAAAAAAAAA";
    const typeB = "BBBBBBBBBBBBBBBBBBBBBBBBBB";
    db.upsertNode("multi-member", { title: "Shared row", body: "" });
    db.upsertNode(typeA, { ...typeTableMarkerProperties("Type A") });
    db.upsertNode(typeB, { ...typeTableMarkerProperties("Type B") });
    db.upsertRelationship("multi-member", typeA, "member_of", { row_index: 0 });
    db.upsertRelationship("multi-member", typeB, "member_of", { row_index: 1 });

    const detail = getNodePageDetail(db, "multi-member", { contentDir });
    const membership = detail?.sections.filter(
      (section) => section.type === "relations" && section.label === "member_of",
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

  const inspirationsTypeId = "0000000000000000000000000K";
  const featuresTypeId = "0000000000000000000000002P";
  const inspirationId = "insp0000000000000000000000000001";
  const featId = "feat0000000000000000000000000001";

  writeMembershipRelationshipTypes(contentDir);
  writeInspirationsFeaturesRelationshipTypes(contentDir, inspirationsTypeId, featuresTypeId);
  writeFileSync(
    tableSchemasFilePath(contentDir),
    serializeTableSchemasFile({
      version: 1,
      tables: {
        "0000000000000000000000000K": {
          columns: [
            {
              key: "features",
              name: "Features",
              type: "relation",
              relationshipType: "inspirations_features",
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

  db.upsertNode(inspirationsTypeId, { ...typeTableMarkerProperties("Inspirations") });
  db.upsertNode(featuresTypeId, { ...typeTableMarkerProperties("Features") });
  db.upsertNode(inspirationId, { title: "Dishonored", body: "" });
  db.upsertRelationship(inspirationId, inspirationsTypeId, "member_of", { row_index: 71 });

  test("includes empty relation section from table-schemas when includeSchemaEmptySections is true", () => {
    const detail = getNodePageDetail(db, inspirationId, {
      contentDir,
      includeSchemaEmptySections: true,
    });
    const features = detail?.sections.find(
      (section) => section.type === "relations" && section.label === "inspirations",
    );

    expect(features).toMatchObject({
      type: "relations",
      label: "inspirations",
      title: "Inspirations",
      typeNodeId: inspirationsTypeId,
      addMode: "link-existing",
      allowedTargetTypeIds: [featuresTypeId],
      columns: [],
      rows: [],
    });
  });

  test("omits table-schema-only relation section by default", () => {
    const detail = getNodePageDetail(db, inspirationId, { contentDir });
    const features = detail?.sections.find(
      (section) => section.type === "relations" && section.label === "inspirations",
    );
    expect(features).toBeUndefined();
  });

  test("does not duplicate section when features link already exists", () => {
    db.upsertNode(featId, { title: "Desperation" });
    db.upsertRelationship(featId, featuresTypeId, "member_of", { row_index: 0 });
    db.upsertRelationship(inspirationId, featId, "inspirations", { ordinal: 0 });

    const detail = getNodePageDetail(db, inspirationId, {
      contentDir,
      includeSchemaEmptySections: true,
    });
    const featuresSections = detail?.sections.filter(
      (section) => section.type === "relations" && section.label === "inspirations",
    );

    expect(featuresSections).toHaveLength(1);
    expect(featuresSections?.[0]).toMatchObject({
      title: "Inspirations",
      rows: [{ targetId: featId, name: "Desperation" }],
    });
  });

  afterAll(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("node-sections children_children addMode", () => {
  const dir = mkdtempSync(join(tmpdir(), "tome-db-sections-children-"));
  const contentDir = join(dir, "content");
  mkdirSync(contentModelDir(contentDir), { recursive: true });
  const dbPath = join(dir, "test.sqlite");
  const db = new GraphDatabase(dbPath);

  const groupsTypeId = "0000000000000000000000002G";

  writeFileSync(
    relationshipTypesFilePath(contentDir),
    serializeRelationshipTypesFile({
      version: 1,
      types: {
        member_of: {
          perspectives: ["members", "member_of"],
          traits: ["set"],
        },
        parents_children: {
          perspectives: ["children", "parents"],
          linkExisting: false,
        },
        children_children: {
          perspectives: ["children", "children"],
          endpoints: {
            0: { typeId: groupsTypeId },
            1: { typeId: groupsTypeId },
          },
        },
      },
    }),
  );
  invalidateRelationshipTypesCache();
  writeFileSync(
    tableSchemasFilePath(contentDir),
    serializeTableSchemasFile({
      version: 1,
      tables: {
        [groupsTypeId]: {
          columns: [
            {
              key: "children",
              name: "Children",
              type: "relation",
              relationshipType: "children_children",
            },
            {
              key: "parents",
              name: "Parents",
              type: "relation",
              relationshipType: "parents_children",
            },
          ],
        },
      },
    }),
  );
  invalidateTableSchemasCache();
  process.env.TOME_CONTENT_PATH = contentDir;

  test("uses children_children composite from table-schema for addMode", () => {
    db.upsertNode(groupsTypeId, { ...typeTableMarkerProperties("Groups") });
    db.upsertNode("group1", { title: "Alpha Squad" });
    db.upsertNode("group2", { title: "Beta Squad" });
    db.upsertRelationship("group1", groupsTypeId, "member_of", { row_index: 0 });
    db.upsertRelationship("group1", "group2", "children", { ordinal: 0 });

    const detail = getNodePageDetail(db, "group1", {
      contentDir,
      includeSchemaEmptySections: true,
    });
    const childrenSection = detail?.sections.find(
      (section) => section.type === "relations" && section.label === "children",
    );

    expect(childrenSection).toMatchObject({
      label: "children",
      addMode: "link-existing",
    });
  });

  afterAll(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("node-sections trait-based set presentation", () => {
  const dir = mkdtempSync(join(tmpdir(), "tome-db-sections-set-trait-"));
  const contentDir = join(dir, "content");
  mkdirSync(contentModelDir(contentDir), { recursive: true });
  const dbPath = join(dir, "test.sqlite");
  const db = new GraphDatabase(dbPath);

  const customSetDb = "0000000000000000000000000C";
  const rowId = "0000000000000000000000000R";
  const featId = "0000000000000000000000000F";

  writeFileSync(
    relationshipTypesFilePath(contentDir),
    serializeRelationshipTypesFile({
      version: 1,
      types: {
        custom_ordered_set: {
          perspectives: ["custom_sets", "custom_members"],
          traits: ["set", "ordered"],
        },
        inspirations_features: {
          perspectives: ["features", "inspirations"],
        },
      },
    }),
  );
  invalidateRelationshipTypesCache();
  process.env.TOME_CONTENT_PATH = contentDir;

  db.upsertNode(customSetDb, { ...typeTableMarkerProperties("Custom Archive") });
  db.upsertNode(rowId, { title: "Custom row", body: "" });
  db.upsertNode(featId, { title: "Feature A" });
  db.upsertRelationship(rowId, customSetDb, "custom_members", { order: "10" });
  db.upsertRelationship(rowId, featId, "features", { ordinal: 0 });
  db.upsertRelationship(rowId, customSetDb, "custom_sets", { order: "10" });

  test("hides set-side perspectives from instance pages", () => {
    const detail = getNodePageDetail(db, rowId, { contentDir });
    const labels = detail?.sections
      .filter((section) => section.type === "relations")
      .map((section) => section.label);

    expect(labels).not.toContain("custom_sets");
    expect(labels).toContain("custom_members");
  });

  test("sorts set-trait member perspectives after other relation sections", () => {
    const detail = getNodePageDetail(db, rowId, { contentDir });
    const labels = detail?.sections
      .filter((section) => section.type === "relations")
      .map((section) => section.label);

    expect(labels).toEqual(["features", "custom_members"]);
  });

  test("uses registry linkExisting false for addMode on structural perspectives", () => {
    writeFileSync(
      relationshipTypesFilePath(contentDir),
      serializeRelationshipTypesFile({
        version: 1,
        types: {
          custom_ordered_set: {
            perspectives: ["custom_sets", "custom_members"],
            traits: ["set", "ordered"],
          },
          parents_children: {
            perspectives: ["children", "parents"],
            linkExisting: false,
          },
        },
      }),
    );
    invalidateRelationshipTypesCache();

    db.upsertNode("child1", { title: "Child row" });
    db.upsertNode("parent1", { title: "Parent row" });
    db.upsertRelationship("child1", "parent1", "parents", { ordinal: 0 });

    const detail = getNodePageDetail(db, "child1", { contentDir });
    const parentsSection = detail?.sections.find(
      (section) => section.type === "relations" && section.label === "parents",
    );

    expect(parentsSection).toMatchObject({
      label: "parents",
      addMode: "none",
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

  const biblePassagesId = "0000000000000000000000000G";
  const memberId = "00000000000000000000000017";
  const featuresTypeId = "0000000000000000000000002P";

  writeFeaturesBiblePassagesRelationshipTypes(contentDir, biblePassagesId, featuresTypeId);
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
              relationshipType: "features_bible_passages",
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
    db.upsertRelationship(memberId, biblePassagesId, "member_of", {
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
      (section) => section.type === "relations" && section.label === "member_of",
    );
    expect(membership).toMatchObject({
      type: "relations",
      label: "member_of",
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
