import { describe, expect, test, afterAll } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { contentModelDir, dynamicPropertiesFilePath, relationshipTypesFilePath, tableSchemasFilePath, projectionTypeForEndpoint } from "tome-flatfile";
import { emptyDynamicPropertiesFile, serializeDynamicPropertiesFile } from "tome-flatfile";
import { serializeTableSchemasFile } from "tome-flatfile";
import { invalidateTableSchemasCache } from "tome-flatfile";
import { GraphDatabase, wrapSyncGraphDatabase } from "tome-sqlite";
import { typeTableMarkerProperties } from "../src/node-capabilities";
import { getDatabaseViewDetail } from "../src/database-view";
import { listRelationConnectionsForRow } from "../src/database-view-relations";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
  TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID,
  TEST_PARENTS_CHILDREN_ASSOCIATION_ID,
  TEST_SCENES_PART_RELATIONSHIP_TYPE_ID,
  TEST_INSPIRATIONS_FEATURES_RELATIONSHIP_TYPE_ID,
} from "../src/content/test-helpers";
import { RELATIONSHIPS_FILE_VERSION } from "tome-flatfile";
import {
  emptyRelationshipTypesFile,
  registerSetRelationshipType,
  registerTypeDefinition,
  serializeRelationshipTypesFile,
} from "tome-flatfile";
import { invalidateRelationshipTypesCache } from "tome-flatfile";

const PROP_TYPE_ASSOCIATION_ID = "000000000000000000000000BD";
const STORY_SCALE_ASSOCIATION_ID = "000000000000000000000000BC";
const NEIGHBOR_ASSOCIATION_ID = "000000000000000000000000C2";

describe("database-view-relations", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tome-db-view-rel-"));
  const contentDir = join(dir, "content");
  mkdirSync(contentModelDir(contentDir), { recursive: true });
  writeFileSync(
    dynamicPropertiesFilePath(contentDir),
    serializeDynamicPropertiesFile(emptyDynamicPropertiesFile()),
  );
  const dbPath = join(dir, "test.sqlite");
  const db = new GraphDatabase(dbPath);
  const cache = wrapSyncGraphDatabase(db);
  process.env.TOME_CONTENT_PATH = contentDir;

  const inspirationsDb = "0000000000000000000000000K";
  const inspirationTypesDb = "00000000000000000000000018";
  const inspirationId = "00000000000000000000000012";
  const tvSeriesTypeId = "0000000000000000000000002D";
  const scenesDb = "0000000000000000000000000V";
  const partsDb = "00000000000000000000000010";
  const sceneId = "00000000000000000000000003";
  const partId = "0000000000000000000000000M";
  const featuresDb = "0000000000000000000000002P";

  const relationTypes = emptyRelationshipTypesFile();
  registerSetRelationshipType(relationTypes, {
    id: TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID,
    perspectives: ["Members", "Membership"],
  });
  registerTypeDefinition(relationTypes, PROP_TYPE_ASSOCIATION_ID, {
    perspectives: ["Prop type", "Inspirations"],
    endpoints: {
      0: { typeId: inspirationsDb },
      1: { typeId: inspirationTypesDb },
    },
  });
  registerTypeDefinition(relationTypes, TEST_PARENTS_CHILDREN_ASSOCIATION_ID, {
    perspectives: ["Children", "Parents"],
  });
  registerTypeDefinition(relationTypes, TEST_SCENES_PART_RELATIONSHIP_TYPE_ID, {
    perspectives: ["Scenes", "Part"],
    endpoints: {
      0: { typeId: scenesDb },
      1: { typeId: partsDb },
    },
  });
  registerTypeDefinition(relationTypes, TEST_INSPIRATIONS_FEATURES_RELATIONSHIP_TYPE_ID, {
    perspectives: ["Features", "Inspirations"],
    endpoints: {
      0: { typeId: featuresDb },
      1: { typeId: inspirationsDb },
    },
  });
  registerTypeDefinition(relationTypes, STORY_SCALE_ASSOCIATION_ID, {
    perspectives: ["Story scale", "Inspirations"],
  });
  writeFileSync(
    relationshipTypesFilePath(contentDir),
    serializeRelationshipTypesFile(relationTypes),
  );
  invalidateRelationshipTypesCache();

  writeFileSync(
    tableSchemasFilePath(contentDir),
    serializeTableSchemasFile({
      version: 1,
      tables: {
        [inspirationsDb]: {
          columns: [
            {
              key: "type",
              name: "Type",
              type: "relation",
              association: PROP_TYPE_ASSOCIATION_ID,
              endpoint: 0,
            },
          ],
        },
      },
    }),
  );
  invalidateTableSchemasCache();

  test("listRelationConnectionsForRow resolves prop_type via row is_a membership", async () => {
    db.upsertNode(inspirationsDb, {
      ...typeTableMarkerProperties("Inspirations"),
    });
    db.upsertNode(inspirationTypesDb, { ...typeTableMarkerProperties("Inspiration types") });
    db.upsertNode(inspirationId, { title: "Ash vs. the Evil Dead" });
    db.upsertNode(tvSeriesTypeId, { title: "TV series" });
    db.upsertRelationship(inspirationId, inspirationsDb, projectionTypeForEndpoint(TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID, 1), { row_index: 0 });
    db.upsertRelationship(tvSeriesTypeId, inspirationTypesDb, projectionTypeForEndpoint(TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID, 1), { row_index: 0 });
    db.upsertRelationship(
      inspirationId,
      tvSeriesTypeId,
      projectionTypeForEndpoint(PROP_TYPE_ASSOCIATION_ID, 0),
      {
        ordinal: 0,
      },
    );

    const connections = await listRelationConnectionsForRow(cache,
      inspirationId,
      projectionTypeForEndpoint(PROP_TYPE_ASSOCIATION_ID, 0),
      inspirationsDb,
      PROP_TYPE_ASSOCIATION_ID,
      contentDir,
    );

    expect(connections).toHaveLength(1);
    expect(connections[0]!.targetNodeId === tvSeriesTypeId ||
      connections[0]!.sourceNodeId === tvSeriesTypeId).toBe(true);
  });

  test("hydrates Type column from row is_a membership without via_database", async () => {
    const detail = await getDatabaseViewDetail(cache, inspirationsDb, undefined, contentDir);
    const row = detail?.rows.find((r) => r.nodeId === inspirationId);
    expect(row?.cells.type).toBe("TV series");
    expect(row?.relationCells?.type).toEqual([
      { targetId: tvSeriesTypeId, title: "TV series" },
    ]);
  });

  test("hydrates parents and children columns without cross-column bleed", async () => {
    const locationsDb = "0000000000000000000000002T";
    const parentLocationId = "AAAAAAAAAAAAAAAAAAAAAAAAAA";
    const childLocationId = "BBBBBBBBBBBBBBBBBBBBBBBBBB";
    const childrenType = projectionTypeForEndpoint(TEST_PARENTS_CHILDREN_ASSOCIATION_ID, 0);
    const parentsType = projectionTypeForEndpoint(TEST_PARENTS_CHILDREN_ASSOCIATION_ID, 1);

    writeFileSync(
      tableSchemasFilePath(contentDir),
      serializeTableSchemasFile({
        version: 1,
        tables: {
          [locationsDb]: {
            columns: [
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
            ],
          },
        },
      }),
    );
    invalidateTableSchemasCache();
    db.upsertNode(locationsDb, { ...typeTableMarkerProperties("Locations") });
    db.upsertNode(parentLocationId, { title: "Marloth" });
    db.upsertNode(childLocationId, { title: "Dark forest" });
    db.upsertRelationship(parentLocationId, locationsDb, projectionTypeForEndpoint(TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID, 1), { row_index: 0 });
    db.upsertRelationship(childLocationId, locationsDb, projectionTypeForEndpoint(TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID, 1), { row_index: 1 });
    db.upsertRelationship(parentLocationId, childLocationId, childrenType, { ordinal: 0 });
    db.upsertRelationship(childLocationId, parentLocationId, parentsType, { ordinal: 0 });

    const parentConnections = await listRelationConnectionsForRow(cache,
      parentLocationId,
      parentsType,
      locationsDb,
      TEST_PARENTS_CHILDREN_ASSOCIATION_ID,
      contentDir,
    );
    const childConnections = await listRelationConnectionsForRow(cache,
      childLocationId,
      childrenType,
      locationsDb,
      TEST_PARENTS_CHILDREN_ASSOCIATION_ID,
      contentDir,
    );
    expect(parentConnections).toHaveLength(0);
    expect(childConnections).toHaveLength(0);

    const parentChildren = await listRelationConnectionsForRow(cache,
      parentLocationId,
      childrenType,
      locationsDb,
      TEST_PARENTS_CHILDREN_ASSOCIATION_ID,
      contentDir,
    );
    const childParents = await listRelationConnectionsForRow(cache,
      childLocationId,
      parentsType,
      locationsDb,
      TEST_PARENTS_CHILDREN_ASSOCIATION_ID,
      contentDir,
    );
    expect(parentChildren).toHaveLength(1);
    expect(childParents).toHaveLength(1);
    expect(parentChildren[0]!.targetNodeId).toBe(childLocationId);
    expect(childParents[0]!.targetNodeId).toBe(parentLocationId);

    const detail = await getDatabaseViewDetail(cache, locationsDb, undefined, contentDir);
    const parentRow = detail?.rows.find((row) => row.nodeId === parentLocationId);
    const childRow = detail?.rows.find((row) => row.nodeId === childLocationId);
    expect(parentRow?.cells.parents).toBeUndefined();
    expect(parentRow?.cells.children).toBe("Dark forest");
    expect(childRow?.cells.parents).toBe("Marloth");
    expect(childRow?.cells.children).toBeUndefined();
  });

  test("hydrates neighbor column on both locations for symmetric neighbor links", async () => {
    const fixture = await createTestContentFixture("tome-db-view-rel-neighbor-");
    const locationsDb = "0000000000000000000000002T";
    const locationA = "CCCCCCCCCCCCCCCCCCCCCCCCCC";
    const locationB = "DDDDDDDDDDDDDDDDDDDDDDDDDD";
    const neighborType = projectionTypeForEndpoint(NEIGHBOR_ASSOCIATION_ID, 0);

    await seedTestNode(fixture, { id: locationsDb, properties: typeTableMarkerProperties("Locations") });
    await seedTestNode(fixture, { id: locationA, properties: { title: "North grove" } });
    await seedTestNode(fixture, { id: locationB, properties: { title: "South grove" } });
    const registry = emptyRelationshipTypesFile();
    registerSetRelationshipType(registry, {
      id: TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID,
      perspectives: ["Members", "Membership"],
    });
    registerTypeDefinition(registry, NEIGHBOR_ASSOCIATION_ID, {
      perspectives: ["Neighbor", "Neighbor"],
      traits: ["symmetric"],
    });
    fixture.ctx.store.writeRelationshipTypesFile(registry);
    fixture.ctx.store.writeRelationshipsFile({
      version: RELATIONSHIPS_FILE_VERSION,
      relationships: [
        {
          a: locationsDb,
          b: locationA,
          type: TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID,
          properties: { row_index: 0 },
        },
        {
          a: locationsDb,
          b: locationB,
          type: TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID,
          properties: { row_index: 1 },
        },
        {
          a: locationA,
          b: locationB,
          type: NEIGHBOR_ASSOCIATION_ID,
          properties: { ordinal: 0 },
        },
      ],
    });
    await fixture.ctx.sync.syncRelationships();

    writeFileSync(
      tableSchemasFilePath(fixture.ctx.store.contentDir),
      serializeTableSchemasFile({
        version: 1,
        tables: {
          [locationsDb]: {
            columns: [
              {
                key: "neighbor",
                name: "Neighbor",
                type: "relation",
                association: NEIGHBOR_ASSOCIATION_ID,
              endpoint: 0,
              },
            ],
          },
        },
      }),
    );
    invalidateTableSchemasCache();

    const neighborContentDir = fixture.ctx.store.contentDir;
    const fromA = await listRelationConnectionsForRow(
      fixture.ctx.cache,
      locationA,
      neighborType,
      locationsDb,
      NEIGHBOR_ASSOCIATION_ID,
      neighborContentDir,
    );
    const fromB = await listRelationConnectionsForRow(
      fixture.ctx.cache,
      locationB,
      neighborType,
      locationsDb,
      NEIGHBOR_ASSOCIATION_ID,
      neighborContentDir,
    );

    expect(fromA).toHaveLength(1);
    expect(fromB).toHaveLength(1);
    expect(fromA[0]!.targetNodeId).toBe(locationB);
    expect(fromB[0]!.targetNodeId).toBe(locationA);

    await destroyTestContentFixture(fixture);
  });

  test("hydrates scenes_part column from row is_a without via_database", async () => {
    writeFileSync(
      tableSchemasFilePath(contentDir),
      serializeTableSchemasFile({
        version: 1,
        tables: {
          [scenesDb]: {
            columns: [
              {
                key: "part",
                name: "Part",
                type: "relation",
                association: TEST_SCENES_PART_RELATIONSHIP_TYPE_ID,
              endpoint: 0,
              },
            ],
          },
        },
      }),
    );
    invalidateTableSchemasCache();
    db.upsertNode(scenesDb, { ...typeTableMarkerProperties("Scenes") });
    db.upsertNode(partsDb, { ...typeTableMarkerProperties("Parts") });
    db.upsertNode(sceneId, { title: "Intro scene" });
    db.upsertNode(partId, { title: "Part 1" });
    db.upsertRelationship(sceneId, scenesDb, projectionTypeForEndpoint(TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID, 1), { row_index: 0, order: "1005" });
    db.upsertRelationship(partId, partsDb, projectionTypeForEndpoint(TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID, 1), { row_index: 0 });
    // From scenes host: distinct endpoints → projection index 0 ("Scenes")
    db.upsertRelationship(sceneId, partId, projectionTypeForEndpoint(TEST_SCENES_PART_RELATIONSHIP_TYPE_ID, 0), { ordinal: 0 });

    const detail = await getDatabaseViewDetail(cache, scenesDb, undefined, contentDir);
    const row = detail?.rows.find((r) => r.nodeId === sceneId);
    expect(row?.cells.part).toBe("Part 1");
    expect(row?.relationCells?.part).toEqual([{ targetId: partId, title: "Part 1" }]);
  });

  test("hydrates Features column with scoped and unscoped includes edges", async () => {
    const inspirationWithMixedFeatures = "0000000000000000000000002W";
    const cozyHorrorId = "0000000000000000000000002X";
    const chaoticWorldId = "0000000000000000000000000A";
    const adventureId = "0000000000000000000000000C";
    const darkForestId = "0000000000000000000000000B";
    const inspirationsProjection = projectionTypeForEndpoint(TEST_INSPIRATIONS_FEATURES_RELATIONSHIP_TYPE_ID, 1);

    db.upsertNode(featuresDb, { ...typeTableMarkerProperties("Features") });
    db.upsertNode(inspirationWithMixedFeatures, { title: "The Evil Within 2" });
    db.upsertNode(cozyHorrorId, { title: "Cozy horror" });
    db.upsertNode(chaoticWorldId, { title: "Chaotic world" });
    db.upsertNode(adventureId, { title: "Adventure" });
    db.upsertNode(darkForestId, { title: "Dark forest" });
    db.upsertRelationship(inspirationWithMixedFeatures, inspirationsDb, projectionTypeForEndpoint(TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID, 1), {
      row_index: 0,
    });
    for (const featureId of [cozyHorrorId, chaoticWorldId, adventureId, darkForestId]) {
      db.upsertRelationship(featureId, featuresDb, projectionTypeForEndpoint(TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID, 1), { row_index: 0 });
    }
    db.upsertRelationship(inspirationWithMixedFeatures, cozyHorrorId, inspirationsProjection);
    db.upsertRelationship(inspirationWithMixedFeatures, chaoticWorldId, inspirationsProjection);
    db.upsertRelationship(inspirationWithMixedFeatures, adventureId, inspirationsProjection);
    db.upsertRelationship(inspirationWithMixedFeatures, darkForestId, inspirationsProjection);

    const connections = await listRelationConnectionsForRow(cache,
      inspirationWithMixedFeatures,
      inspirationsProjection,
      inspirationsDb,
      TEST_INSPIRATIONS_FEATURES_RELATIONSHIP_TYPE_ID,
      contentDir,
    );
    expect(connections).toHaveLength(4);
    const linkedTitles = connections
      .map((connection) => {
        const otherId =
          connection.sourceNodeId === inspirationWithMixedFeatures
            ? connection.targetNodeId
            : connection.sourceNodeId;
        return db.getNode(otherId)?.properties.title;
      })
      .sort();
    expect(linkedTitles).toEqual([
      "Adventure",
      "Chaotic world",
      "Cozy horror",
      "Dark forest",
    ]);
  });

  test("hydrates all Inspirations from Features when some inspiration ids sort before the feature", async () => {
    // Mirrors Satire: bidirectional projections share a record_id; lex-smaller
    // source was previously kept and dropped the Features→Inspirations projection.
    const featureId = "000000000000000000000000M0";
    const earlyInspirationId = "000000000000000000000000A0";
    const lateInspirationId = "000000000000000000000000Z0";
    const featuresProjection = projectionTypeForEndpoint(TEST_INSPIRATIONS_FEATURES_RELATIONSHIP_TYPE_ID, 0);
    const inspirationsProjection = projectionTypeForEndpoint(TEST_INSPIRATIONS_FEATURES_RELATIONSHIP_TYPE_ID, 1);

    db.upsertNode(featuresDb, { ...typeTableMarkerProperties("Features") });
    db.upsertNode(featureId, { title: "Satire" });
    db.upsertNode(earlyInspirationId, { title: "Dilbert" });
    db.upsertNode(lateInspirationId, { title: "The Office" });
    db.upsertRelationship(featureId, featuresDb, projectionTypeForEndpoint(TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID, 1), {
      row_index: 0,
    });
    for (const inspirationId of [earlyInspirationId, lateInspirationId]) {
      db.upsertRelationship(inspirationId, inspirationsDb, projectionTypeForEndpoint(TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID, 1), {
        row_index: 0,
      });
    }

    const seedBidirectional = (recordId: string, inspirationId: string) => {
      db.upsertRelationshipRecord({
        id: recordId,
        nodeA: featureId,
        nodeB: inspirationId,
        compositeType: TEST_INSPIRATIONS_FEATURES_RELATIONSHIP_TYPE_ID,
        properties: {},
      });
      db.upsertRelationshipProjection({
        id: `${recordId}:0`,
        recordId,
        sourceNodeId: featureId,
        targetNodeId: inspirationId,
        type: featuresProjection,
        properties: {},
      });
      db.upsertRelationshipProjection({
        id: `${recordId}:1`,
        recordId,
        sourceNodeId: inspirationId,
        targetNodeId: featureId,
        type: inspirationsProjection,
        properties: {},
      });
    };
    seedBidirectional("rel-early-inspiration", earlyInspirationId);
    seedBidirectional("rel-late-inspiration", lateInspirationId);

    expect(earlyInspirationId < featureId).toBe(true);
    expect(lateInspirationId > featureId).toBe(true);

    const connections = await listRelationConnectionsForRow(cache,
      featureId,
      featuresProjection,
      featuresDb,
      TEST_INSPIRATIONS_FEATURES_RELATIONSHIP_TYPE_ID,
      contentDir,
    );
    expect(connections).toHaveLength(2);
    const linkedTitles = connections
      .map((connection) => {
        const otherId =
          connection.sourceNodeId === featureId ? connection.targetNodeId : connection.sourceNodeId;
        return db.getNode(otherId)?.properties.title;
      })
      .sort();
    expect(linkedTitles).toEqual(["Dilbert", "The Office"]);

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
                association: TEST_INSPIRATIONS_FEATURES_RELATIONSHIP_TYPE_ID,
              endpoint: 0,
              },
            ],
          },
        },
      }),
    );
    invalidateTableSchemasCache();

    const detail = await getDatabaseViewDetail(cache, featuresDb, undefined, contentDir);
    const row = detail?.rows.find((r) => r.nodeId === featureId);
    expect(row?.relationCells?.inspirations).toEqual([
      { targetId: earlyInspirationId, title: "Dilbert" },
      { targetId: lateInspirationId, title: "The Office" },
    ]);
  });

  test("story_scale relation column hydrates from relationships, not a stale scalar member_of property", async () => {
    const storyScaleRowsDb = "0000000000000000000000001D";
    const storyScaleDb = "0000000000000000000000001Y";
    const storyScaleRowId = "0000000000000000000000002A";
    const extendedScaleId = "0000000000000000000000002N";
    const storyScaleProjection = projectionTypeForEndpoint(STORY_SCALE_ASSOCIATION_ID, 0);

    writeFileSync(
      tableSchemasFilePath(contentDir),
      serializeTableSchemasFile({
        version: 1,
        tables: {
          [storyScaleRowsDb]: {
            columns: [
              {
                key: "story_scale",
                name: "Story scale",
                type: "relation",
                association: STORY_SCALE_ASSOCIATION_ID,
              endpoint: 0,
              },
            ],
          },
        },
      }),
    );
    invalidateTableSchemasCache();

    db.upsertNode(storyScaleRowsDb, { ...typeTableMarkerProperties("Traversal reasons") });
    db.upsertNode(storyScaleDb, { ...typeTableMarkerProperties("Story scale") });
    db.upsertNode(storyScaleRowId, { title: "Mission-based" });
    db.upsertNode(extendedScaleId, { title: "Extended" });
    db.upsertRelationship(storyScaleRowId, storyScaleRowsDb, projectionTypeForEndpoint(TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID, 1), {
      row_index: 0,
      story_scale: "https://legacy.example/00000000000000000000000019",
    });
    db.upsertRelationship(extendedScaleId, storyScaleDb, projectionTypeForEndpoint(TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID, 1), { row_index: 0 });
    db.upsertRelationship(storyScaleRowId, extendedScaleId, storyScaleProjection, {
      ordinal: 0,
    });

    const detail = await getDatabaseViewDetail(cache, storyScaleRowsDb, undefined, contentDir);
    const row = detail?.rows.find((r) => r.nodeId === storyScaleRowId);
    expect(row?.relationCells?.story_scale).toEqual([
      { targetId: extendedScaleId, title: "Extended" },
    ]);
    expect(row?.cells.story_scale).toBe("Extended");
    expect(row?.cells.story_scale ?? "").not.toContain("://");
  });

  afterAll(async () => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
