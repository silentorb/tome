import { TEST_MEMBER_OF_ASSOCIATION_ID, TEST_INSPIRATIONS_FEATURES_ASSOCIATION_ID, TEST_SCENES_PART_ASSOCIATION_ID, TEST_PARENTS_CHILDREN_ASSOCIATION_ID, TEST_CHILDREN_CHILDREN_ASSOCIATION_ID, TEST_FEATURES_BIBLE_PASSAGES_ASSOCIATION_ID } from "../src/content/test-helpers";
import { describe, expect, test, afterAll } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { GraphDatabase } from "tome-sqlite";
import { typeTableMarkerProperties } from "../src/node-capabilities";
import { getNodePageDetail } from "../src/node-page-sections";
import { contentModelDir, associationsFilePath, tableSchemasFilePath, projectionTypeForEndpoint } from "tome-flatfile";
import {
  serializeAssociationsFile,
} from "tome-flatfile";
import { serializeTableSchemasFile } from "tome-flatfile";
import { invalidateAssociationsCache } from "tome-flatfile";
import { invalidateTableSchemasCache } from "tome-flatfile";

function writeMembershipAssociations(contentDir: string): void {
  writeFileSync(
    associationsFilePath(contentDir),
    serializeAssociationsFile({
      version: 1,
      associations: {
        "000000000000000000000000A1": {
          perspectives: ["Members", { title: "Membership", linkAdd: "Link type table" }],
          traits: ["set"],
        },
        "000000000000000000000000B2": {
          perspectives: ["Features", "Inspirations"],
        },
        "000000000000000000000000A4": {
          perspectives: ["Scenes", "Part"],
        },
      },
    }),
  );
  invalidateAssociationsCache();
}

function writeInspirationsFeaturesAssociations(
  contentDir: string,
  inspirationsTypeId: string,
  featuresTypeId: string,
): void {
  writeFileSync(
    associationsFilePath(contentDir),
    serializeAssociationsFile({
      version: 1,
      associations: {
        "000000000000000000000000A1": {
          perspectives: ["Members", { title: "Membership", linkAdd: "Link type table" }],
          traits: ["set"],
        },
        "000000000000000000000000B2": {
          perspectives: ["Features", "Inspirations"],
          endpoints: {
            0: { typeId: featuresTypeId },
            1: { typeId: inspirationsTypeId },
          },
        },
      },
    }),
  );
  invalidateAssociationsCache();
}

function writeFeaturesBiblePassagesAssociations(
  contentDir: string,
  biblePassagesTypeId: string,
  featuresTypeId: string,
): void {
  writeFileSync(
    associationsFilePath(contentDir),
    serializeAssociationsFile({
      version: 1,
      associations: {
        "000000000000000000000000A1": {
          perspectives: ["Members", { title: "Membership", linkAdd: "Link type table" }],
          traits: ["set"],
        },
        "000000000000000000000000B5": {
          perspectives: ["Features", "Bible passages"],
          endpoints: {
            0: { typeId: featuresTypeId },
            1: { typeId: biblePassagesTypeId },
          },
        },
      },
    }),
  );
  invalidateAssociationsCache();
}

describe("node-sections", () => {
  const dir = mkdtempSync(join(tmpdir(), "tome-db-sections-"));
  const contentDir = join(dir, "content");
  mkdirSync(contentModelDir(contentDir), { recursive: true });
  writeMembershipAssociations(contentDir);
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
    db.upsertRelationship("scene1", "feat1", projectionTypeForEndpoint(TEST_INSPIRATIONS_FEATURES_ASSOCIATION_ID, 0), { ordinal: 0, weight: "strong" });
    db.upsertRelationship("scene1", "insp1", projectionTypeForEndpoint(TEST_INSPIRATIONS_FEATURES_ASSOCIATION_ID, 1), { ordinal: 1 });

    const detail = getNodePageDetail(db, "scene1");
    const relationSections = detail?.sections.filter((section) => section.type === "relations");

    expect(relationSections).toHaveLength(2);
    expect(relationSections?.[0]).toMatchObject({
      type: "relations",
      label: projectionTypeForEndpoint(TEST_INSPIRATIONS_FEATURES_ASSOCIATION_ID, 0),
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
      label: projectionTypeForEndpoint(TEST_INSPIRATIONS_FEATURES_ASSOCIATION_ID, 1),
      addMode: "link-existing",
      rows: [{ targetId: "insp1", name: "Pride and Prejudice" }],
    });
  });

  test("defaults addMode link-existing on part relation sections", () => {
    db.upsertNode("scene5", { title: "Bridge" });
    db.upsertNode("part1", { title: "The Orphanage" });
    db.upsertRelationship("scene5", "part1", projectionTypeForEndpoint(TEST_SCENES_PART_ASSOCIATION_ID, 1), { ordinal: 0 });

    const detail = getNodePageDetail(db, "scene5", { contentDir });
    const partSection = detail?.sections.find(
      (section) => section.type === "relations" && section.label === projectionTypeForEndpoint(TEST_SCENES_PART_ASSOCIATION_ID, 1),
    );

    expect(partSection).toMatchObject({
      label: projectionTypeForEndpoint(TEST_SCENES_PART_ASSOCIATION_ID, 1),
      addMode: "link-existing",
    });
  });

  test("honors registry linkExisting false on relation sections", () => {
    writeFileSync(
      associationsFilePath(contentDir),
      serializeAssociationsFile({
        version: 1,
        associations: {
          "000000000000000000000000A1": {
            perspectives: ["Members", { title: "Membership", linkAdd: "Link type table" }],
          traits: ["set"],
          },
          "000000000000000000000000B2": {
            perspectives: ["Features", "Inspirations"],
          },
          "000000000000000000000000A4": {
            perspectives: ["Scenes", "Part"],
            linkExisting: false,
          },
        },
      }),
    );
    invalidateAssociationsCache();

    db.upsertNode("scene6", { title: "Harbor" });
    db.upsertNode("part2", { title: "Act II" });
    db.upsertRelationship("scene6", "part2", projectionTypeForEndpoint(TEST_SCENES_PART_ASSOCIATION_ID, 1), { ordinal: 0 });

    const detail = getNodePageDetail(db, "scene6", { contentDir });
    const partSection = detail?.sections.find(
      (section) => section.type === "relations" && section.label === projectionTypeForEndpoint(TEST_SCENES_PART_ASSOCIATION_ID, 1),
    );

    expect(partSection).toMatchObject({
      label: projectionTypeForEndpoint(TEST_SCENES_PART_ASSOCIATION_ID, 1),
      addMode: "none",
    });

    writeMembershipAssociations(contentDir);
  });

  test("adds database table section for type-table records after markdown", () => {
    const databaseId = "db42345678901234567890123456789012";
    db.upsertNode(databaseId, { ...typeTableMarkerProperties("Features DB"), body: "# About" });
    db.upsertNode("page4", { title: "Guest consultant" });
    db.upsertRelationship("page4", databaseId, projectionTypeForEndpoint(TEST_MEMBER_OF_ASSOCIATION_ID, 1), {
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
    db.upsertRelationship("page5", databaseId, projectionTypeForEndpoint(TEST_MEMBER_OF_ASSOCIATION_ID, 1), {
      priority: "High",
    });

    const detail = getNodePageDetail(db, "page5", { contentDir });
    const membership = detail?.sections.find(
      (section) => section.type === "relations" && section.label === projectionTypeForEndpoint(TEST_MEMBER_OF_ASSOCIATION_ID, 1),
    );

    expect(membership).toMatchObject({
      type: "relations",
      label: projectionTypeForEndpoint(TEST_MEMBER_OF_ASSOCIATION_ID, 1),
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
    db.upsertRelationship("page6", databaseId, projectionTypeForEndpoint(TEST_MEMBER_OF_ASSOCIATION_ID, 1), { status: "Unresolved" });

    const detail = getNodePageDetail(db, "page6", { contentDir });
    const membership = detail?.sections.find(
      (section) => section.type === "relations" && section.label === projectionTypeForEndpoint(TEST_MEMBER_OF_ASSOCIATION_ID, 1),
    );

    expect(membership).toMatchObject({
      type: "relations",
      label: projectionTypeForEndpoint(TEST_MEMBER_OF_ASSOCIATION_ID, 1),
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
    db.upsertRelationship("scene2", featuresTypeId, projectionTypeForEndpoint(TEST_MEMBER_OF_ASSOCIATION_ID, 1), { row_index: 0 });
    db.upsertNode("feat2", { title: "Desperation" });
    db.upsertRelationship("scene2", "feat2", projectionTypeForEndpoint(TEST_INSPIRATIONS_FEATURES_ASSOCIATION_ID, 0), { ordinal: 0 });

    const detail = getNodePageDetail(db, "scene2");
    const features = detail?.sections.find(
      (section) => section.type === "relations" && section.label === projectionTypeForEndpoint(TEST_INSPIRATIONS_FEATURES_ASSOCIATION_ID, 0),
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
    db.upsertRelationship("scene3", inspTypeId, projectionTypeForEndpoint(TEST_MEMBER_OF_ASSOCIATION_ID, 1), { row_index: 0 });
    db.upsertNode("insp2", { title: "Emma" });
    db.upsertRelationship("scene3", "insp2", projectionTypeForEndpoint(TEST_INSPIRATIONS_FEATURES_ASSOCIATION_ID, 1), { ordinal: 0 });

    const detail = getNodePageDetail(db, "scene3");
    const inspirations = detail?.sections.find(
      (section) => section.type === "relations" && section.label === projectionTypeForEndpoint(TEST_INSPIRATIONS_FEATURES_ASSOCIATION_ID, 1),
    );

    expect(inspirations?.type === "relations" ? inspirations.typeNodeId : undefined).toBe(inspTypeId);
    expect(inspirations?.type === "relations" ? inspirations.title : undefined).toBe("Inspirations");
  });

  test("groups multiple member_of parents in one Membership section", () => {
    const typeA = "AAAAAAAAAAAAAAAAAAAAAAAAAA";
    const typeB = "BBBBBBBBBBBBBBBBBBBBBBBBBB";
    db.upsertNode("multi-member", { title: "Shared row", body: "" });
    db.upsertNode(typeA, { ...typeTableMarkerProperties("Type A") });
    db.upsertNode(typeB, { ...typeTableMarkerProperties("Type B") });
    db.upsertRelationship("multi-member", typeA, projectionTypeForEndpoint(TEST_MEMBER_OF_ASSOCIATION_ID, 1), { row_index: 0 });
    db.upsertRelationship("multi-member", typeB, projectionTypeForEndpoint(TEST_MEMBER_OF_ASSOCIATION_ID, 1), { row_index: 1 });

    const detail = getNodePageDetail(db, "multi-member", { contentDir });
    const membership = detail?.sections.filter(
      (section) => section.type === "relations" && section.label === projectionTypeForEndpoint(TEST_MEMBER_OF_ASSOCIATION_ID, 1),
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

  writeMembershipAssociations(contentDir);
  writeInspirationsFeaturesAssociations(contentDir, inspirationsTypeId, featuresTypeId);
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
              association: "000000000000000000000000B2",
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
  db.upsertRelationship(inspirationId, inspirationsTypeId, projectionTypeForEndpoint(TEST_MEMBER_OF_ASSOCIATION_ID, 1), { row_index: 71 });

  test("includes empty relation section from table-schemas when includeSchemaEmptySections is true", () => {
    const detail = getNodePageDetail(db, inspirationId, {
      contentDir,
      includeSchemaEmptySections: true,
    });
    const features = detail?.sections.find(
      (section) => section.type === "relations" && section.label === projectionTypeForEndpoint(TEST_INSPIRATIONS_FEATURES_ASSOCIATION_ID, 1),
    );

    expect(features).toMatchObject({
      type: "relations",
      label: projectionTypeForEndpoint(TEST_INSPIRATIONS_FEATURES_ASSOCIATION_ID, 1),
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
      (section) => section.type === "relations" && section.label === projectionTypeForEndpoint(TEST_INSPIRATIONS_FEATURES_ASSOCIATION_ID, 1),
    );
    expect(features).toBeUndefined();
  });

  test("does not duplicate section when features link already exists", () => {
    db.upsertNode(featId, { title: "Desperation" });
    db.upsertRelationship(featId, featuresTypeId, projectionTypeForEndpoint(TEST_MEMBER_OF_ASSOCIATION_ID, 1), { row_index: 0 });
    db.upsertRelationship(inspirationId, featId, projectionTypeForEndpoint(TEST_INSPIRATIONS_FEATURES_ASSOCIATION_ID, 1), { ordinal: 0 });

    const detail = getNodePageDetail(db, inspirationId, {
      contentDir,
      includeSchemaEmptySections: true,
    });
    const featuresSections = detail?.sections.filter(
      (section) => section.type === "relations" && section.label === projectionTypeForEndpoint(TEST_INSPIRATIONS_FEATURES_ASSOCIATION_ID, 1),
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
    associationsFilePath(contentDir),
    serializeAssociationsFile({
      version: 1,
      associations: {
        "000000000000000000000000A1": {
          perspectives: ["Members", "Membership"],
          traits: ["set"],
        },
        "000000000000000000000000B1": {
          perspectives: ["Children", "Parents"],
          linkExisting: false,
        },
        "000000000000000000000000B4": {
          perspectives: ["children", "children"],
          endpoints: {
            0: { typeId: groupsTypeId },
            1: { typeId: groupsTypeId },
          },
        },
      },
    }),
  );
  invalidateAssociationsCache();
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
              association: "000000000000000000000000B4",
            },
            {
              key: "parents",
              name: "Parents",
              type: "relation",
              association: "000000000000000000000000B1",
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
    db.upsertRelationship("group1", groupsTypeId, projectionTypeForEndpoint(TEST_MEMBER_OF_ASSOCIATION_ID, 1), { row_index: 0 });
    db.upsertRelationship("group1", "group2", projectionTypeForEndpoint(TEST_CHILDREN_CHILDREN_ASSOCIATION_ID, 0), { ordinal: 0 });

    const detail = getNodePageDetail(db, "group1", {
      contentDir,
      includeSchemaEmptySections: true,
    });
    const childrenSection = detail?.sections.find(
      (section) => section.type === "relations" && section.label === projectionTypeForEndpoint(TEST_CHILDREN_CHILDREN_ASSOCIATION_ID, 0),
    );

    expect(childrenSection).toMatchObject({
      label: projectionTypeForEndpoint(TEST_CHILDREN_CHILDREN_ASSOCIATION_ID, 0),
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
  const customSetAssociationId = "000000000000000000000000C1";

  writeFileSync(
    associationsFilePath(contentDir),
    serializeAssociationsFile({
      version: 1,
      associations: {
        [customSetAssociationId]: {
          perspectives: ["Custom sets", "Custom members"],
          traits: ["set", "ordered"],
        },
        "000000000000000000000000B2": {
          perspectives: ["Features", "Inspirations"],
        },
      },
    }),
  );
  invalidateAssociationsCache();
  process.env.TOME_CONTENT_PATH = contentDir;

  db.upsertNode(customSetDb, { ...typeTableMarkerProperties("Custom Archive") });
  db.upsertNode(rowId, { title: "Custom row", body: "" });
  db.upsertNode(featId, { title: "Feature A" });
  db.upsertRelationship(rowId, customSetDb, projectionTypeForEndpoint(customSetAssociationId, 1), { order: "10" });
  db.upsertRelationship(rowId, featId, projectionTypeForEndpoint(TEST_INSPIRATIONS_FEATURES_ASSOCIATION_ID, 0), { ordinal: 0 });
  db.upsertRelationship(rowId, customSetDb, projectionTypeForEndpoint(customSetAssociationId, 0), { order: "10" });

  test("hides set-side perspectives from instance pages", () => {
    const detail = getNodePageDetail(db, rowId, { contentDir });
    const labels = detail?.sections
      .filter((section) => section.type === "relations")
      .map((section) => section.label);

    expect(labels).not.toContain(projectionTypeForEndpoint(customSetAssociationId, 0));
    expect(labels).toContain(projectionTypeForEndpoint(customSetAssociationId, 1));
  });

  test("sorts set-trait member perspectives after other relation sections", () => {
    const detail = getNodePageDetail(db, rowId, { contentDir });
    const labels = detail?.sections
      .filter((section) => section.type === "relations")
      .map((section) => section.label);

    expect(labels).toEqual([
      projectionTypeForEndpoint(TEST_INSPIRATIONS_FEATURES_ASSOCIATION_ID, 0),
      projectionTypeForEndpoint(customSetAssociationId, 1),
    ]);
  });

  test("uses registry linkExisting false for addMode on structural perspectives", () => {
    writeFileSync(
      associationsFilePath(contentDir),
      serializeAssociationsFile({
        version: 1,
        associations: {
          [customSetAssociationId]: {
            perspectives: ["Custom sets", "Custom members"],
            traits: ["set", "ordered"],
          },
          "000000000000000000000000B1": {
            perspectives: ["Children", "Parents"],
            linkExisting: false,
          },
        },
      }),
    );
    invalidateAssociationsCache();

    db.upsertNode("child1", { title: "Child row" });
    db.upsertNode("parent1", { title: "Parent row" });
    db.upsertRelationship("child1", "parent1", projectionTypeForEndpoint(TEST_PARENTS_CHILDREN_ASSOCIATION_ID, 1), { ordinal: 0 });

    const detail = getNodePageDetail(db, "child1", { contentDir });
    const parentsSection = detail?.sections.find(
      (section) => section.type === "relations" && section.label === projectionTypeForEndpoint(TEST_PARENTS_CHILDREN_ASSOCIATION_ID, 1),
    );

    expect(parentsSection).toMatchObject({
      label: projectionTypeForEndpoint(TEST_PARENTS_CHILDREN_ASSOCIATION_ID, 1),
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

  writeFeaturesBiblePassagesAssociations(contentDir, biblePassagesId, featuresTypeId);
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
              association: "000000000000000000000000B5",
            },
            { key: "verses", name: "Verses", type: "rich_text" },
          ],
        },
      },
    }),
  );
  invalidateTableSchemasCache();
  writeMembershipAssociations(contentDir);
  process.env.TOME_CONTENT_PATH = contentDir;

  test("member row shows Verses in Properties and Bible passages in member_of section", () => {
    db.upsertNode(biblePassagesId, { ...typeTableMarkerProperties("Bible passages") });
    db.upsertNode(memberId, { title: "Men gather to David", body: "> 1 Samuel 22:2" });
    db.upsertRelationship(memberId, biblePassagesId, projectionTypeForEndpoint(TEST_MEMBER_OF_ASSOCIATION_ID, 1), {
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
      (section) => section.type === "relations" && section.label === projectionTypeForEndpoint(TEST_MEMBER_OF_ASSOCIATION_ID, 1),
    );
    expect(membership).toMatchObject({
      type: "relations",
      label: projectionTypeForEndpoint(TEST_MEMBER_OF_ASSOCIATION_ID, 1),
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
