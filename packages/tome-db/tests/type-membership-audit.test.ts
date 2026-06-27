import { describe, expect, test, afterAll } from "bun:test";
import { resolve } from "node:path";
import { GraphDatabase } from "../src/graph";
import { typeTableMarkerProperties } from "../src/node-capabilities";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestTableSchema,
} from "../src/content/test-helpers";
import { openTomeWriteContext } from "../src/content/write-context";
import { IS_A_TYPE } from "../src/labels";
import {
  expectedTypeDatabaseForPage,
  findMissingTypeMembershipRelationships,
  findNestedPageSpuriousTypeMembership,
  findSpuriousTypeMembershipRelationships,
  findNodeScalarsOnTypedNodes,
  folderDepthUnderInstanceRoot,
  instanceRootFromTypeTableExport,
  isNestedPageSpuriousTypeMembership,
  typeDatabaseTitleFromPath,
  typeFolderFromPath,
} from "../src/type-membership-audit";

const EXPORT_PREFIX =
  "exports/e1871eda-1585-4e95-9781-1add0033d51f_ExportBlock-7929816c-16af-4229-9d56-b036ede8360e.zip/";

describe("type-membership-audit path matching", () => {
  const fixture = createTestContentFixture("tome-type-audit-path-");
  const db = fixture.ctx.db;

  seedTestTableSchema(fixture, "2eea538996934ce8abafc27132e576c1", []);
  seedTestTableSchema(fixture, "ec2d335a7cd84ada8911b7585cc05ab1", []);
  seedTestTableSchema(fixture, "dd0de9867cc345b898929306bdf9fc83", []);

  test("typeDatabaseTitleFromPath prefers deepest matching database segment", () => {
    db.upsertNode("2eea538996934ce8abafc27132e576c1", {
      ...typeTableMarkerProperties("Inspirations"),
    });
    db.upsertNode("ec2d335a7cd84ada8911b7585cc05ab1", {
      ...typeTableMarkerProperties("Traversal reasons"),
    });
    db.upsertNode("dd0de9867cc345b898929306bdf9fc83", {
      ...typeTableMarkerProperties("Features"),
    });

    const contentDir = fixture.ctx.store.contentDir;
    expect(typeDatabaseTitleFromPath(db, "Marloth/Inspirations", "Marloth", contentDir)).toBe(
      "Inspirations",
    );
    expect(
      typeDatabaseTitleFromPath(db, "Marloth/Inspirations/Traversal reasons", "Marloth", contentDir),
    ).toBe("Traversal reasons");
    expect(typeDatabaseTitleFromPath(db, "Marloth/Features/Community", "Marloth", contentDir)).toBe(
      "Features",
    );
    expect(typeDatabaseTitleFromPath(db, "Marloth/Archive/Lab", "Marloth", contentDir)).toBeNull();
  });

  test("typeDatabaseTitleFromPath accepts custom export path prefix", () => {
    db.upsertNode("2eea538996934ce8abafc27132e576c1", {
      ...typeTableMarkerProperties("Inspirations"),
    });
    const contentDir = fixture.ctx.store.contentDir;
    expect(typeDatabaseTitleFromPath(db, "Acme/Inspirations", "Acme", contentDir)).toBe(
      "Inspirations",
    );
    expect(typeDatabaseTitleFromPath(db, "Marloth/Inspirations", "Acme", contentDir)).toBeNull();
    expect(typeFolderFromPath("Acme/Features/Community", "Acme")).toBe("Features");
    expect(typeFolderFromPath("Marloth/Features/Community", "Acme")).toBeNull();
  });

  afterAll(() => {
    destroyTestContentFixture(fixture);
  });
});

describe("expectedTypeDatabaseForPage legacy paths", () => {
  test("expectedTypeDatabaseForPage no longer infers from legacy paths", () => {
    const db = new GraphDatabase(":memory:");
    db.upsertNode("missions", { title: "Missions" });
    expect(expectedTypeDatabaseForPage(db, "missions")).toBeNull();
  });
});

describe("nested page type membership", () => {
  const FEATURES_DB = "dd0de9867cc345b898929306bdf9fc83";
  const CHARACTERS_DB = "f984a934ad644f8480b0f8f51449569f";
  const TRAVERSAL_DB = "ec2d335a7cd84ada8911b7585cc05ab1";

  const featuresCsv = `${EXPORT_PREFIX}Marloth/Features ${FEATURES_DB}_all.csv`;
  const charactersCsv = `${EXPORT_PREFIX}Marloth/Data/Characters ${CHARACTERS_DB}_all.csv`;
  const traversalCsv = `${EXPORT_PREFIX}Marloth/Inspirations/Traversal reasons ${TRAVERSAL_DB}_all.csv`;

  test("instanceRootFromTypeTableExport derives per-database instance folders", () => {
    expect(instanceRootFromTypeTableExport(featuresCsv)).toBe("Marloth/Features/");
    expect(instanceRootFromTypeTableExport(charactersCsv)).toBe("Marloth/Data/Characters/");
    expect(instanceRootFromTypeTableExport(traversalCsv)).toBe(
      "Marloth/Inspirations/Traversal reasons/",
    );
  });

  test("folderDepthUnderInstanceRoot counts nested sub-pages", () => {
    const root = "Marloth/Features/";
    const direct = `${EXPORT_PREFIX}Marloth/Features/Surreal cee6644b68094859bf1b17c5e7fd25de.md`;
    const nested = `${EXPORT_PREFIX}Marloth/Features/Surreal/Applied surrealism 29a58e628ba280dfa7a0ecf58f43045c.md`;
    expect(folderDepthUnderInstanceRoot(direct, root)).toBe(0);
    expect(folderDepthUnderInstanceRoot(nested, root)).toBe(1);
  });

  test("isNestedPageSpuriousTypeMembership flags nested and out-of-root pages", () => {
    const applied = `${EXPORT_PREFIX}Marloth/Features/Surreal/Applied surrealism 29a58e628ba280dfa7a0ecf58f43045c.md`;
    const surreal = `${EXPORT_PREFIX}Marloth/Features/Surreal cee6644b68094859bf1b17c5e7fd25de.md`;
    const quest = `${EXPORT_PREFIX}Marloth/Inspirations/Traversal reasons/Quest a4f61ad2283b441ea7492e1afb41160f.md`;
    const archive = `${EXPORT_PREFIX}Marloth/Archive/Values/Family provision e7524ffe3a8b4bd59f2c7fa7719051f2.md`;
    const nestedChar = `${EXPORT_PREFIX}Marloth/Data/Characters/The Tea Shop Owner/Tea shop owner scoping 2cb58e628ba28067b6f6facdac8f5e13.md`;

    expect(isNestedPageSpuriousTypeMembership(applied, featuresCsv)).toEqual({
      spurious: true,
      reason: "nested_sub_page",
    });
    expect(isNestedPageSpuriousTypeMembership(surreal, featuresCsv)).toEqual({ spurious: false });
    expect(isNestedPageSpuriousTypeMembership(quest, traversalCsv)).toEqual({ spurious: false });
    expect(isNestedPageSpuriousTypeMembership(archive, featuresCsv)).toEqual({
      spurious: true,
      reason: "outside_instance_root",
    });
    expect(isNestedPageSpuriousTypeMembership(nestedChar, charactersCsv)).toEqual({
      spurious: true,
      reason: "nested_sub_page",
    });
  });

  test("findNestedPageSpuriousTypeMembership scans type tables with export paths", () => {
    const fixture = createTestContentFixture("nested-page-audit-");
    const db = fixture.ctx.db;
    const contentDir = fixture.ctx.store.contentDir;

    seedTestTableSchema(fixture, FEATURES_DB, []);
    seedTestTableSchema(fixture, CHARACTERS_DB, []);
    seedTestTableSchema(fixture, TRAVERSAL_DB, []);

    db.upsertNode(FEATURES_DB, {
      title: "Features",
      source_export: featuresCsv,
    });
    db.upsertNode(CHARACTERS_DB, {
      title: "Characters",
      source_export: charactersCsv,
    });
    db.upsertNode(TRAVERSAL_DB, {
      title: "Traversal reasons",
      source_export: traversalCsv,
    });

    const appliedId = "29a58e628ba280dfa7a0ecf58f43045c";
    const surrealId = "cee6644b68094859bf1b17c5e7fd25de";
    const questId = "a4f61ad2283b441ea7492e1afb41160f";
    const nestedCharId = "2cb58e628ba28067b6f6facdac8f5e13";

    db.upsertNode(appliedId, {
      title: "Applied surrealism",
      source_export: `${EXPORT_PREFIX}Marloth/Features/Surreal/Applied surrealism ${appliedId}.md`,
    });
    db.upsertNode(surrealId, {
      title: "Surreal",
      source_export: `${EXPORT_PREFIX}Marloth/Features/Surreal ${surrealId}.md`,
    });
    db.upsertNode(questId, {
      title: "Quest",
      source_export: `${EXPORT_PREFIX}Marloth/Inspirations/Traversal reasons/Quest ${questId}.md`,
    });
    db.upsertNode(nestedCharId, {
      title: "Tea shop owner scoping",
      source_export: `${EXPORT_PREFIX}Marloth/Data/Characters/The Tea Shop Owner/Tea shop owner scoping ${nestedCharId}.md`,
    });

    db.upsertRelationship(appliedId, FEATURES_DB, IS_A_TYPE, { view: "all", row_index: 113 });
    db.upsertRelationship(surrealId, FEATURES_DB, IS_A_TYPE, {
      view: "all",
      row_index: 112,
      priority: "Primary",
    });
    db.upsertRelationship(questId, TRAVERSAL_DB, IS_A_TYPE, { view: "all", row_index: 3 });
    db.upsertRelationship(nestedCharId, CHARACTERS_DB, IS_A_TYPE, { view: "all", row_index: 35 });

    const spurious = findNestedPageSpuriousTypeMembership(db, contentDir);
    const ids = spurious.map((row) => row.nodeId);
    expect(ids).toContain(appliedId);
    expect(ids).toContain(nestedCharId);
    expect(ids).not.toContain(surrealId);
    expect(ids).not.toContain(questId);

    destroyTestContentFixture(fixture);
  });
});

const productionContentDir = resolve(import.meta.dir, "../../../repos/marloth-story/content");
const productionDbPath = resolve(import.meta.dir, "../../../repos/marloth-story/data/tome.sqlite");
/** Run manually with marloth content synced: un-skip this block. */
describe.skip("type-membership-audit (production graph)", () => {
  test("every typed page has an IS_A edge to its expected database", () => {
    const ctx = openTomeWriteContext(productionContentDir, productionDbPath);
    try {
      const missing = findMissingTypeMembershipRelationships(ctx.db);
      expect(missing).toEqual([]);
    } finally {
      ctx.db.close();
    }
  });

  test("typed pages do not have spurious IS_A edges to other databases", () => {
    const ctx = openTomeWriteContext(productionContentDir, productionDbPath);
    try {
      const spurious = findSpuriousTypeMembershipRelationships(ctx.db);
      expect(spurious).toEqual([]);
    } finally {
      ctx.db.close();
    }
  });

  test("typed pages do not store row scalars on the vertex", () => {
    const ctx = openTomeWriteContext(productionContentDir, productionDbPath);
    try {
      const violations = findNodeScalarsOnTypedNodes(ctx.db);
      expect(violations).toEqual([]);
    } finally {
      ctx.db.close();
    }
  });
});
