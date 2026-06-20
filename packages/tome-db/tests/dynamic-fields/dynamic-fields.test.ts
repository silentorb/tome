import { describe, expect, test, afterAll, beforeAll } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ContentStore } from "../../src/content/store";
import { fileFromSeedInputs } from "../../src/content/dynamic-fields-file";
import { invalidateDynamicFieldsCache } from "../../src/content/sync";
import { invalidateSchemaCache } from "../../src/schema-rules/load";
import { GraphDatabase } from "../../src/graph";
import { typeTableMarkerProperties } from "../../src/node-capabilities";
import { IS_A_TYPE } from "../../src/labels";
import { getDatabaseViewDetail } from "../../src/database-view";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestCompositeRelationships,
  seedTestDynamicFields,
  seedTestNode,
  seedTestRelationships,
} from "../../src/content/test-helpers";
import {
  buildAllSceneCountPrefetch,
  buildSceneCountByProductPrefetch,
  buildWeightedUsePrefetch,
  buildWonderPrefetch,
  resolveAllSceneCount,
  resolveSceneCountByProduct,
  resolveWeightedUse,
  resolveWonder,
} from "../../src/dynamic-fields/resolvers/index";

const LEGACY_CHARACTER_SCENE_PARAMS = {
  scenes_edge_label: "SCENES",
};

const LEGACY_CHARACTER_PRODUCT_PARAMS = {
  scenes_edge_label: "SCENES",
  product_edge_label: "product",
  hide_legacy_keys: ["twold_scene_count"],
};

const LEGACY_INSPIRATION_WEIGHTED_PARAMS = {
  features_edge_label: "features",
  features_database_id: "dd0de9867cc345b898929306bdf9fc83",
};

const LEGACY_INSPIRATION_WONDER_PARAMS = {
  features_edge_label: "features",
  theme_edge_label: "THEME",
  theme_target_id: "3cbc40d2ba2a4c76b4b9dc370452fcfe",
};

describe("dynamic-fields resolvers", () => {
  const dir = mkdtempSync(join(tmpdir(), "tome-df-"));
  const dbPath = join(dir, "test.sqlite");
  const db = new GraphDatabase(dbPath);

  const CHAR_DB = "f984a934ad644f8480b0f8f51449569f";
  const INSP_DB = "2eea538996934ce8abafc27132e576c1";
  const FEAT_DB = "dd0de9867cc345b898929306bdf9fc83";
  const TWOLD = "e028aa0786f5449984a4f497c1d746fa";
  const OTHER_PRODUCT = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const WONDERLAND = "3cbc40d2ba2a4c76b4b9dc370452fcfe";

  const character = "cccccccccccccccccccccccccccccccc";
  const scene1 = "11111111111111111111111111111111";
  const scene2 = "22222222222222222222222222222222";
  const scene3 = "33333333333333333333333333333333";
  const inspiration = "44444444444444444444444444444444";
  const featureWonder = "55555555555555555555555555555555";
  const featurePlain = "66666666666666666666666666666666";

  beforeAll(() => {
    const contentDir = join(dir, "content");
    mkdirSync(contentDir, { recursive: true });
    process.env.TOME_CONTENT_PATH = contentDir;
    const store = new ContentStore(contentDir);
    store.writeDynamicFieldsFile(
      fileFromSeedInputs(
        [
          {
            id: "test-all-scene",
            databaseId: CHAR_DB,
            columnKey: "all_scene_count",
            columnName: "All Scene count",
            resolverId: "characters.allSceneCount",
            docsPath: "docs/dynamic-fields/characters.all-scene-count.md",
            params: LEGACY_CHARACTER_SCENE_PARAMS,
          },
          {
            id: "test-weighted-use",
            databaseId: INSP_DB,
            columnKey: "weighted_use",
            columnName: "Weighted Use",
            resolverId: "inspirations.weightedUse",
            docsPath: "docs/dynamic-fields/inspirations.weighted-use.md",
            params: { ...LEGACY_INSPIRATION_WEIGHTED_PARAMS, features_database_id: FEAT_DB },
          },
          {
            id: "test-wonder",
            databaseId: INSP_DB,
            columnKey: "wonder",
            columnName: "Wonder",
            resolverId: "inspirations.wonder",
            docsPath: "docs/dynamic-fields/inspirations.wonder.md",
            params: { ...LEGACY_INSPIRATION_WONDER_PARAMS, theme_target_id: WONDERLAND },
          },
        ],
        [
          {
            id: "test-scene-by-product",
            databaseId: CHAR_DB,
            columnKeyPattern: "scene_count__{productId}",
            columnNamePattern: "{productTitle} Scene count",
            resolverId: "characters.sceneCountByProduct",
            docsPath: "docs/dynamic-fields/characters.scene-count-by-product.md",
            params: LEGACY_CHARACTER_PRODUCT_PARAMS,
          },
        ],
      ),
    );
    invalidateDynamicFieldsCache();
    db.upsertNode(CHAR_DB, { ...typeTableMarkerProperties("Characters") });
    db.upsertNode(INSP_DB, { ...typeTableMarkerProperties("Inspirations") });
    db.upsertNode(FEAT_DB, { ...typeTableMarkerProperties("Features") });
    db.upsertNode(TWOLD, { title: "TWOLD" });
    db.upsertNode(OTHER_PRODUCT, { title: "Other Book" });
    db.upsertNode(WONDERLAND, { title: "Wonderland" });

    db.upsertNode(character, { title: "James" });
    db.upsertRelationship(character, CHAR_DB, IS_A_TYPE, { row_index: 0 });

    db.upsertNode(scene1, { title: "Scene A" });
    db.upsertNode(scene2, { title: "Scene B" });
    db.upsertNode(scene3, { title: "Scene C" });
    db.upsertRelationship(character, scene1, "SCENES", {});
    db.upsertRelationship(character, scene2, "SCENES", {});
    db.upsertRelationship(character, scene3, "SCENES", {});
    db.upsertRelationship(scene1, TWOLD, "product", {});
    db.upsertRelationship(scene2, TWOLD, "product", {});
    db.upsertRelationship(scene3, OTHER_PRODUCT, "product", {});

    db.upsertNode(inspiration, { title: "Test Inspiration" });
    db.upsertRelationship(inspiration, INSP_DB, IS_A_TYPE, { row_index: 0 });

    db.upsertNode(featureWonder, { title: "Adventure" });
    db.upsertNode(featurePlain, { title: "Plain" });
    db.upsertRelationship(featureWonder, FEAT_DB, IS_A_TYPE, { priority: "Medium" });
    db.upsertRelationship(featurePlain, FEAT_DB, IS_A_TYPE, { priority: "High" });
    db.upsertRelationship(inspiration, featureWonder, "features", {});
    db.upsertRelationship(inspiration, featurePlain, "features", {});
    db.upsertRelationship(featureWonder, WONDERLAND, "THEME", {});
  });

  test("all scene count", () => {
    const ctx = { db, databaseId: CHAR_DB, viewName: "All", rowNodeIds: [character] };
    const prefetch = buildAllSceneCountPrefetch(ctx, LEGACY_CHARACTER_SCENE_PARAMS);
    expect(resolveAllSceneCount(ctx, {}, character, prefetch)).toBe("3");
  });

  test("scene count by product", () => {
    const ctx = { db, databaseId: CHAR_DB, viewName: "All", rowNodeIds: [character] };
    const prefetch = buildSceneCountByProductPrefetch(ctx, LEGACY_CHARACTER_PRODUCT_PARAMS);
    expect(resolveSceneCountByProduct(ctx, {}, character, TWOLD, prefetch)).toBe("2");
    expect(resolveSceneCountByProduct(ctx, {}, character, OTHER_PRODUCT, prefetch)).toBe("1");
  });

  test("weighted use", () => {
    const ctx = { db, databaseId: INSP_DB, viewName: "Weighted", rowNodeIds: [inspiration] };
    const params = { ...LEGACY_INSPIRATION_WEIGHTED_PARAMS, features_database_id: FEAT_DB };
    const prefetch = buildWeightedUsePrefetch(ctx, params);
    expect(resolveWeightedUse(ctx, {}, inspiration, prefetch)).toBe("6");
  });

  test("wonder count", () => {
    const ctx = { db, databaseId: INSP_DB, viewName: "Wonder", rowNodeIds: [inspiration] };
    const params = { ...LEGACY_INSPIRATION_WONDER_PARAMS, theme_target_id: WONDERLAND };
    const prefetch = buildWonderPrefetch(ctx, params);
    expect(resolveWonder(ctx, {}, inspiration, prefetch)).toBe("1");
  });

  test("returns zero when composite param omitted despite composite edges in graph", () => {
    const ctx = { db, databaseId: INSP_DB, viewName: "Weighted", rowNodeIds: [inspiration] };
    expect(
      resolveWeightedUse(
        ctx,
        {},
        inspiration,
        buildWeightedUsePrefetch(ctx, { features_database_id: FEAT_DB }),
      ),
    ).toBe("0");
  });

  test("returns zero for scene count when edge label param omitted", () => {
    const ctx = { db, databaseId: CHAR_DB, viewName: "All", rowNodeIds: [character] };
    const prefetch = buildAllSceneCountPrefetch(ctx, {});
    expect(resolveAllSceneCount(ctx, {}, character, prefetch)).toBe("0");
  });

  test("database view integration for characters", () => {
    const contentDir = join(dir, "content");
    const detail = getDatabaseViewDetail(db, CHAR_DB, undefined, contentDir);
    const james = detail?.rows.find((r) => r.nodeId === character);
    expect(james?.cells.all_scene_count).toBe("3");
    expect(james?.cells[`scene_count__${TWOLD}`]).toBe("2");
    expect(james?.cells[`scene_count__${OTHER_PRODUCT}`]).toBe("1");
    expect(detail?.columnDefs?.some((c) => c.key === `scene_count__${TWOLD}`)).toBe(true);
  });

  test("database view integration for inspirations", () => {
    const contentDir = join(dir, "content");
    const detail = getDatabaseViewDetail(db, INSP_DB, undefined, contentDir);
    const row = detail?.rows.find((r) => r.nodeId === inspiration);
    expect(row?.cells.weighted_use).toBe("6");
    expect(row?.cells.wonder).toBe("1");
  });

  afterAll(() => {
    delete process.env.TOME_CONTENT_PATH;
    invalidateDynamicFieldsCache();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("dynamic-fields with composite relationships", () => {
  const fixture = createTestContentFixture("tome-df-composite-");
  const INSP_DB = "2eea538996934ce8abafc27132e576c1";
  const FEAT_DB = "dd0de9867cc345b898929306bdf9fc83";
  const WONDERLAND = "3cbc40d2ba2a4c76b4b9dc370452fcfe";
  const inspiration = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const featureWonder = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const featurePlain = "cccccccccccccccccccccccccccccccc";

  beforeAll(() => {
    process.env.TOME_CONTENT_PATH = fixture.ctx.store.contentDir;
    writeFileSync(
      join(fixture.ctx.store.contentDir, "model", "schema.json"),
      JSON.stringify({
        version: 1,
        relationshipRules: [],
        enums: {
          priority: {
            options: ["Low", "Medium", "High", "Consideration"],
            default: "Low",
            values: { Low: 1, Medium: 2, High: 4, Consideration: 0 },
          },
        },
      }),
    );
    invalidateSchemaCache();
    seedTestDynamicFields(fixture, [
      {
        id: "inspirations-weighted-use",
        databaseId: INSP_DB,
        columnKey: "weighted_use",
        columnName: "Weighted Use",
        resolverId: "inspirations.weightedUse",
        docsPath: "docs/dynamic-fields/inspirations.weighted-use.md",
        params: {
          inspiration_feature_composite: "inspirations_features",
          features_edge_label: "FEATURES",
          features_database_id: FEAT_DB,
        },
      },
      {
        id: "inspirations-wonder",
        databaseId: INSP_DB,
        columnKey: "wonder",
        columnName: "Wonder",
        resolverId: "inspirations.wonder",
        docsPath: "docs/dynamic-fields/inspirations.wonder.md",
        params: {
          inspiration_feature_composite: "inspirations_features",
          features_edge_label: "FEATURES",
          theme_edge_label: "THEME",
          theme_target_id: WONDERLAND,
        },
      },
    ]);
    seedTestNode(fixture, { id: INSP_DB, properties: typeTableMarkerProperties("Inspirations") });
    seedTestNode(fixture, { id: FEAT_DB, properties: typeTableMarkerProperties("Features") });
    seedTestNode(fixture, { id: WONDERLAND, properties: { title: "Wonderland" } });
    seedTestNode(fixture, { id: inspiration, properties: { title: "Test Inspiration" } });
    seedTestNode(fixture, { id: featureWonder, properties: { title: "Adventure" } });
    seedTestNode(fixture, { id: featurePlain, properties: { title: "Plain" } });
    seedTestRelationships(fixture, [
      { source: inspiration, target: INSP_DB, type: IS_A_TYPE, properties: { row_index: 0 } },
      { source: featureWonder, target: FEAT_DB, type: IS_A_TYPE, properties: { priority: "Medium" } },
      { source: featurePlain, target: FEAT_DB, type: IS_A_TYPE, properties: { priority: "High" } },
    ]);
    seedTestCompositeRelationships(fixture, [
      { a: inspiration, b: featureWonder, typeFromA: "inspirations", typeFromB: "features", properties: {} },
      { a: inspiration, b: featurePlain, typeFromA: "inspirations", typeFromB: "features", properties: {} },
    ]);
    seedTestRelationships(fixture, [
      {
        source: featureWonder,
        target: WONDERLAND,
        type: "theme",
        properties: {},
      },
    ]);
  });

  test("weighted_use and wonder with production params and composite edges", () => {
    const detail = getDatabaseViewDetail(
      fixture.ctx.db,
      INSP_DB,
      undefined,
      fixture.ctx.store.contentDir,
    );
    const row = detail?.rows.find((entry) => entry.nodeId === inspiration);
    expect(row?.cells.weighted_use).toBe("6");
    expect(row?.cells.wonder).toBe("1");
  });

  test("weighted_use returns zero when inspiration_feature_composite omitted", () => {
    const ctx = {
      db: fixture.ctx.db,
      databaseId: INSP_DB,
      viewName: "Weighted",
      rowNodeIds: [inspiration],
    };
    expect(
      resolveWeightedUse(
        ctx,
        {},
        inspiration,
        buildWeightedUsePrefetch(ctx, { features_database_id: FEAT_DB }),
      ),
    ).toBe("0");
  });

  afterAll(() => {
    delete process.env.TOME_CONTENT_PATH;
    invalidateDynamicFieldsCache();
    destroyTestContentFixture(fixture);
  });
});

describe("dynamic-fields character composite relationships", () => {
  const fixture = createTestContentFixture("tome-df-char-composite-");
  const CHAR_DB = "f984a934ad644f8480b0f8f51449569f";
  const TWOLD = "e028aa0786f5449984a4f497c1d746fa";
  const OTHER_PRODUCT = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const character = "cccccccccccccccccccccccccccccccc";
  const scene1 = "11111111111111111111111111111111";
  const scene2 = "22222222222222222222222222222222";
  const scene3 = "33333333333333333333333333333333";

  const productionParams = {
    characters_scene_composite: "scenes_characters",
    scene_product_composite: "scenes_product",
    scenes_edge_label: "SCENES",
    product_edge_label: "PRODUCT",
  };

  beforeAll(() => {
    process.env.TOME_CONTENT_PATH = fixture.ctx.store.contentDir;
    seedTestDynamicFields(
      fixture,
      [
        {
          id: "characters-all-scene-count",
          databaseId: CHAR_DB,
          columnKey: "all_scene_count",
          columnName: "All Scene count",
          resolverId: "characters.allSceneCount",
          docsPath: "docs/dynamic-fields/characters.all-scene-count.md",
          params: {
            characters_scene_composite: "scenes_characters",
            scenes_edge_label: "SCENES",
          },
        },
      ],
      [
        {
          id: "characters-scene-count-by-product",
          databaseId: CHAR_DB,
          columnKeyPattern: "scene_count__{productId}",
          columnNamePattern: "{productTitle} Scene count",
          columnType: "number",
          resolverId: "characters.sceneCountByProduct",
          docsPath: "docs/dynamic-fields/characters.scene-count-by-product.md",
          params: productionParams,
        },
      ],
    );
    seedTestNode(fixture, { id: CHAR_DB, properties: typeTableMarkerProperties("Characters") });
    seedTestNode(fixture, { id: TWOLD, properties: { title: "TWOLD" } });
    seedTestNode(fixture, { id: OTHER_PRODUCT, properties: { title: "Other Book" } });
    seedTestNode(fixture, { id: character, properties: { title: "James" } });
    seedTestNode(fixture, { id: scene1, properties: { title: "Scene A" } });
    seedTestNode(fixture, { id: scene2, properties: { title: "Scene B" } });
    seedTestNode(fixture, { id: scene3, properties: { title: "Scene C" } });
    seedTestRelationships(fixture, [
      { source: character, target: CHAR_DB, type: IS_A_TYPE, properties: { row_index: 0 } },
    ]);
    seedTestCompositeRelationships(fixture, [
      { a: character, b: scene1, typeFromA: "characters", typeFromB: "scenes", properties: {} },
      { a: character, b: scene2, typeFromA: "characters", typeFromB: "scenes", properties: {} },
      { a: character, b: scene3, typeFromA: "characters", typeFromB: "scenes", properties: {} },
      { a: scene1, b: TWOLD, typeFromA: "scenes", typeFromB: "product", properties: {} },
      { a: scene2, b: TWOLD, typeFromA: "scenes", typeFromB: "product", properties: {} },
      { a: scene3, b: OTHER_PRODUCT, typeFromA: "scenes", typeFromB: "product", properties: {} },
    ]);
  });

  test("all scene count and per-product columns via composite edges", () => {
    const ctx = { db: fixture.ctx.db, databaseId: CHAR_DB, viewName: "All", rowNodeIds: [character] };
    const allScenePrefetch = buildAllSceneCountPrefetch(ctx, {
      characters_scene_composite: "scenes_characters",
      scenes_edge_label: "SCENES",
    });
    expect(resolveAllSceneCount(ctx, {}, character, allScenePrefetch)).toBe("3");

    const productPrefetch = buildSceneCountByProductPrefetch(ctx, productionParams);
    expect(resolveSceneCountByProduct(ctx, {}, character, TWOLD, productPrefetch)).toBe("2");
    expect(resolveSceneCountByProduct(ctx, {}, character, OTHER_PRODUCT, productPrefetch)).toBe("1");
  });

  test("database view integration with composite character edges", () => {
    const detail = getDatabaseViewDetail(
      fixture.ctx.db,
      CHAR_DB,
      undefined,
      fixture.ctx.store.contentDir,
    );
    const james = detail?.rows.find((row) => row.nodeId === character);
    expect(james?.cells.all_scene_count).toBe("3");
    expect(james?.cells[`scene_count__${TWOLD}`]).toBe("2");
    expect(james?.cells[`scene_count__${OTHER_PRODUCT}`]).toBe("1");
  });

  afterAll(() => {
    delete process.env.TOME_CONTENT_PATH;
    invalidateDynamicFieldsCache();
    destroyTestContentFixture(fixture);
  });
});
