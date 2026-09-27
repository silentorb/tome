import { describe, expect, test, afterAll } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  relationshipTypesFilePath,
  contentModelDir,
  invalidateRelationshipTypesCache,
  projectionTypeForEndpoint,
  serializeRelationshipTypesFile,
} from "tome-flatfile";
import {
  TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID,
  TEST_PARENTS_CHILDREN_ASSOCIATION_ID,
} from "../../src/content/test-helpers";
import { FIXED_AGGREGATE_BY_RESOLVER } from "../../src/dynamic-properties/aggregate";
import { collectExpressionIndexReachTypes } from "../../src/dynamic-properties/expression-index-reach";

describe("collectExpressionIndexReachTypes", () => {
  const dir = mkdtempSync(join(tmpdir(), "tome-expr-reach-"));
  const contentDir = join(dir, "content");
  mkdirSync(contentModelDir(contentDir), { recursive: true });
  writeFileSync(
    relationshipTypesFilePath(contentDir),
    serializeRelationshipTypesFile({
      version: 1,
      relationshipTypes: {
        [TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID]: {
          perspectives: ["Members", "Membership"],
          traits: ["set"],
        },
        [TEST_PARENTS_CHILDREN_ASSOCIATION_ID]: {
          perspectives: ["Children", "Parents"],
        },
      },
    }),
  );
  invalidateRelationshipTypesCache();

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("includes composite projections, fallback, and owner set-trait types", () => {
    const sceneProj = projectionTypeForEndpoint(TEST_PARENTS_CHILDREN_ASSOCIATION_ID, 0);
    const setSide = projectionTypeForEndpoint(TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID, 0);
    const memberSide = projectionTypeForEndpoint(TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID, 1);
    const composite = TEST_PARENTS_CHILDREN_ASSOCIATION_ID;
    const spec = FIXED_AGGREGATE_BY_RESOLVER["characters.allSceneCount"];
    const types = collectExpressionIndexReachTypes(
      spec,
      {
        characters_scene_composite: composite,
        scenes_edge_label: sceneProj,
      },
      "01OWNER00000000000000000001",
      contentDir,
    );
    expect(types).toContain(composite);
    expect(types).toContain(sceneProj);
    expect(types).toContain(setSide);
    expect(types).toContain(memberSide);
    for (const projection of [
      projectionTypeForEndpoint(TEST_PARENTS_CHILDREN_ASSOCIATION_ID, 0),
      projectionTypeForEndpoint(TEST_PARENTS_CHILDREN_ASSOCIATION_ID, 1),
    ]) {
      expect(types).toContain(projection);
    }
  });

  test("countReachWhere also includes where projection type", () => {
    const themeEdge = "THEME:0";
    const spec = FIXED_AGGREGATE_BY_RESOLVER["inspirations.wonder"];
    const types = collectExpressionIndexReachTypes(
      spec,
      {
        inspiration_feature_composite: TEST_PARENTS_CHILDREN_ASSOCIATION_ID,
        theme_edge_label: themeEdge,
        theme_target_id: "01THEME0000000000000000001",
      },
      "01OWNER00000000000000000001",
      contentDir,
    );
    expect(types).toContain(themeEdge);
    expect(types).toContain(TEST_PARENTS_CHILDREN_ASSOCIATION_ID);
  });
});
