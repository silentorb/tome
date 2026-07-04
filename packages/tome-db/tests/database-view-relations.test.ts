import { describe, expect, test, afterAll } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { contentModelDir, dynamicFieldsFilePath, tableSchemasFilePath } from "../src/content/paths";
import { emptyDynamicFieldsFile, serializeDynamicFieldsFile } from "../src/content/dynamic-fields-file";
import { serializeTableSchemasFile } from "../src/content/table-schemas-file";
import { invalidateTableSchemasCache } from "../src/table-schemas/load";
import { GraphDatabase } from "../src/graph";
import { MEMBER_OF_TYPE } from "../src/labels";
import { typeTableMarkerProperties } from "../src/node-capabilities";
import { getDatabaseViewDetail } from "../src/database-view";
import { listRelationConnectionsForRow } from "../src/database-view-relations";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
} from "../src/content/test-helpers";
import { RELATIONSHIPS_FILE_VERSION } from "../src/content/relationships-file";
import {
  emptyRelationshipTypesFile,
  registerTypeDefinition,
} from "../src/content/relationship-types-file";

describe("database-view-relations", () => {
  const dir = mkdtempSync(join(tmpdir(), "tome-db-view-rel-"));
  const contentDir = join(dir, "content");
  mkdirSync(contentModelDir(contentDir), { recursive: true });
  writeFileSync(
    dynamicFieldsFilePath(contentDir),
    serializeDynamicFieldsFile(emptyDynamicFieldsFile()),
  );
  const dbPath = join(dir, "test.sqlite");
  const db = new GraphDatabase(dbPath);

  const inspirationsDb = "0000000000000000000000000K";
  const inspirationTypesDb = "00000000000000000000000018";
  const inspirationId = "00000000000000000000000012";
  const tvSeriesTypeId = "0000000000000000000000002D";
  const scenesDb = "0000000000000000000000000V";
  const partsDb = "00000000000000000000000010";
  const sceneId = "00000000000000000000000003";
  const partId = "0000000000000000000000000M";

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
              targetTypeId: inspirationTypesDb,
              perspective: "prop_type",
            },
          ],
        },
      },
    }),
  );
  invalidateTableSchemasCache();

  test("listRelationConnectionsForRow resolves prop_type via row is_a membership", () => {
    db.upsertNode(inspirationsDb, {
      ...typeTableMarkerProperties("Inspirations"),
    });
    db.upsertNode(inspirationTypesDb, { ...typeTableMarkerProperties("Inspiration types") });
    db.upsertNode(inspirationId, { title: "Ash vs. the Evil Dead" });
    db.upsertNode(tvSeriesTypeId, { title: "TV series" });
    db.upsertRelationship(inspirationId, inspirationsDb, MEMBER_OF_TYPE, { row_index: 0 });
    db.upsertRelationship(tvSeriesTypeId, inspirationTypesDb, MEMBER_OF_TYPE, { row_index: 0 });
    db.upsertRelationship(inspirationId, tvSeriesTypeId, "prop_type_inspirations", {
      ordinal: 0,
      via_view: "default",
    });

    const connections = listRelationConnectionsForRow(
      db,
      inspirationId,
      "prop_type",
      inspirationsDb,
      inspirationTypesDb,
    );

    expect(connections).toHaveLength(1);
    expect(connections[0]!.targetNodeId === tvSeriesTypeId ||
      connections[0]!.sourceNodeId === tvSeriesTypeId).toBe(true);
  });

  test("hydrates Type column from row is_a membership without via_database", () => {
    const detail = getDatabaseViewDetail(db, inspirationsDb, undefined, contentDir);
    const row = detail?.rows.find((r) => r.nodeId === inspirationId);
    expect(row?.cells.type).toBe("TV series");
    expect(row?.relationCells?.type).toEqual([
      { targetId: tvSeriesTypeId, title: "TV series" },
    ]);
  });

  test("hydrates parents and children columns without cross-column bleed", () => {
    const locationsDb = "0000000000000000000000002T";
    const parentLocationId = "AAAAAAAAAAAAAAAAAAAAAAAAAA";
    const childLocationId = "BBBBBBBBBBBBBBBBBBBBBBBBBB";

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
                targetTypeId: locationsDb,
                perspective: "parents",
              },
              {
                key: "children",
                name: "Children",
                type: "relation",
                targetTypeId: locationsDb,
                perspective: "children",
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
    db.upsertRelationship(parentLocationId, locationsDb, MEMBER_OF_TYPE, { row_index: 0 });
    db.upsertRelationship(childLocationId, locationsDb, MEMBER_OF_TYPE, { row_index: 1 });
    db.upsertRelationship(parentLocationId, childLocationId, "children", { ordinal: 0 });
    db.upsertRelationship(childLocationId, parentLocationId, "parents", { ordinal: 0 });

    const parentConnections = listRelationConnectionsForRow(
      db,
      parentLocationId,
      "parents",
      locationsDb,
      locationsDb,
    );
    const childConnections = listRelationConnectionsForRow(
      db,
      childLocationId,
      "children",
      locationsDb,
      locationsDb,
    );
    expect(parentConnections).toHaveLength(0);
    expect(childConnections).toHaveLength(0);

    const parentChildren = listRelationConnectionsForRow(
      db,
      parentLocationId,
      "children",
      locationsDb,
      locationsDb,
    );
    const childParents = listRelationConnectionsForRow(
      db,
      childLocationId,
      "parents",
      locationsDb,
      locationsDb,
    );
    expect(parentChildren).toHaveLength(1);
    expect(childParents).toHaveLength(1);
    expect(parentChildren[0]!.targetNodeId).toBe(childLocationId);
    expect(childParents[0]!.targetNodeId).toBe(parentLocationId);

    const detail = getDatabaseViewDetail(db, locationsDb, undefined, contentDir);
    const parentRow = detail?.rows.find((row) => row.nodeId === parentLocationId);
    const childRow = detail?.rows.find((row) => row.nodeId === childLocationId);
    expect(parentRow?.cells.parents).toBeUndefined();
    expect(parentRow?.cells.children).toBe("Dark forest");
    expect(childRow?.cells.parents).toBe("Marloth");
    expect(childRow?.cells.children).toBeUndefined();
  });

  test("hydrates neighbor column on both locations for symmetric neighbor links", () => {
    const fixture = createTestContentFixture("tome-db-view-rel-neighbor-");
    const locationsDb = "0000000000000000000000002T";
    const locationA = "CCCCCCCCCCCCCCCCCCCCCCCCCC";
    const locationB = "DDDDDDDDDDDDDDDDDDDDDDDDDD";

    seedTestNode(fixture, { id: locationsDb, properties: typeTableMarkerProperties("Locations") });
    seedTestNode(fixture, { id: locationA, properties: { title: "North grove" } });
    seedTestNode(fixture, { id: locationB, properties: { title: "South grove" } });
    const registry = emptyRelationshipTypesFile();
    registerTypeDefinition(registry, "neighbor", {
      perspectives: ["neighbor", "neighbor"],
    });
    fixture.ctx.store.writeRelationshipTypesFile(registry);
    fixture.ctx.store.writeRelationshipsFile({
      version: RELATIONSHIPS_FILE_VERSION,
      relationships: [
        {
          a: locationA,
          b: locationsDb,
          type: MEMBER_OF_TYPE,
          directedFrom: locationA,
          properties: { row_index: 0 },
        },
        {
          a: locationB,
          b: locationsDb,
          type: MEMBER_OF_TYPE,
          directedFrom: locationB,
          properties: { row_index: 1 },
        },
        {
          a: locationA,
          b: locationB,
          type: "neighbor",
          directedFrom: locationA,
          properties: { ordinal: 0 },
        },
      ],
    });
    fixture.ctx.sync.syncRelationships();

    const fromA = listRelationConnectionsForRow(
      fixture.ctx.db,
      locationA,
      "neighbor",
      locationsDb,
      locationsDb,
    );
    const fromB = listRelationConnectionsForRow(
      fixture.ctx.db,
      locationB,
      "neighbor",
      locationsDb,
      locationsDb,
    );

    expect(fromA).toHaveLength(1);
    expect(fromB).toHaveLength(1);
    expect(fromA[0]!.targetNodeId).toBe(locationB);
    expect(fromB[0]!.targetNodeId).toBe(locationA);

    destroyTestContentFixture(fixture);
  });

  test("hydrates scenes_part column from row is_a without via_database", () => {
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
                targetTypeId: partsDb,
                perspective: "part",
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
    db.upsertRelationship(sceneId, scenesDb, MEMBER_OF_TYPE, { row_index: 0, order: "1005" });
    db.upsertRelationship(partId, partsDb, MEMBER_OF_TYPE, { row_index: 0 });
    db.upsertRelationship(sceneId, partId, "scenes_part", { ordinal: 0 });

    const detail = getDatabaseViewDetail(db, scenesDb, undefined, contentDir);
    const row = detail?.rows.find((r) => r.nodeId === sceneId);
    expect(row?.cells.part).toBe("Part 1");
    expect(row?.relationCells?.part).toEqual([{ targetId: partId, title: "Part 1" }]);
  });

  test("hydrates Features column with scoped and unscoped includes edges", () => {
    const featuresDb = "0000000000000000000000002P";
    const inspirationWithMixedFeatures = "0000000000000000000000002W";
    const cozyHorrorId = "0000000000000000000000002X";
    const chaoticWorldId = "0000000000000000000000000A";
    const adventureId = "0000000000000000000000000C";
    const darkForestId = "0000000000000000000000000B";

    db.upsertNode(featuresDb, { ...typeTableMarkerProperties("Features") });
    db.upsertNode(inspirationWithMixedFeatures, { title: "The Evil Within 2" });
    db.upsertNode(cozyHorrorId, { title: "Cozy horror" });
    db.upsertNode(chaoticWorldId, { title: "Chaotic world" });
    db.upsertNode(adventureId, { title: "Adventure" });
    db.upsertNode(darkForestId, { title: "Dark forest" });
    db.upsertRelationship(inspirationWithMixedFeatures, inspirationsDb, MEMBER_OF_TYPE, {
      row_index: 0,
    });
    for (const featureId of [cozyHorrorId, chaoticWorldId, adventureId, darkForestId]) {
      db.upsertRelationship(featureId, featuresDb, MEMBER_OF_TYPE, { row_index: 0 });
    }
    db.upsertRelationship(inspirationWithMixedFeatures, cozyHorrorId, "includes");
    db.upsertRelationship(chaoticWorldId, inspirationWithMixedFeatures, "includes");
    db.upsertRelationship(adventureId, inspirationWithMixedFeatures, "includes");
    db.upsertRelationship(darkForestId, inspirationWithMixedFeatures, "includes");

    const connections = listRelationConnectionsForRow(
      db,
      inspirationWithMixedFeatures,
      "features",
      inspirationsDb,
      featuresDb,
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

  test("story_scale relation column hydrates from relationships, not a stale scalar member_of property", () => {
    // Regression guard for the legacy-import cleanup: the corpus historically stored
    // a scalar `story_scale` (and `traversal_types`) on the member_of edge holding a
    // comma-joined URL string. Relation columns must hydrate from the
    // `{perspective}_inspirations` composite relationships and never surface the
    // stale scalar (which used to leak a raw URL into the cell).
    const storyScaleRowsDb = "0000000000000000000000001D";
    const storyScaleDb = "0000000000000000000000001Y";
    const storyScaleRowId = "0000000000000000000000002A";
    const extendedScaleId = "0000000000000000000000002N";

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
                targetTypeId: storyScaleDb,
                perspective: "story_scale",
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
    db.upsertRelationship(storyScaleRowId, storyScaleRowsDb, MEMBER_OF_TYPE, {
      row_index: 0,
      story_scale: "https://legacy.example/00000000000000000000000019",
    });
    db.upsertRelationship(extendedScaleId, storyScaleDb, MEMBER_OF_TYPE, { row_index: 0 });
    db.upsertRelationship(storyScaleRowId, extendedScaleId, "story_scale_inspirations", {
      ordinal: 0,
      via_view: "default",
    });

    const detail = getDatabaseViewDetail(db, storyScaleRowsDb, undefined, contentDir);
    const row = detail?.rows.find((r) => r.nodeId === storyScaleRowId);
    expect(row?.relationCells?.story_scale).toEqual([
      { targetId: extendedScaleId, title: "Extended" },
    ]);
    expect(row?.cells.story_scale).toBe("Extended");
    expect(row?.cells.story_scale ?? "").not.toContain("://");
  });

  afterAll(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
