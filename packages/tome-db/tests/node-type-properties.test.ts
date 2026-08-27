import { describe, expect, test, afterAll } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ContentStore, projectionTypeForEndpoint } from "tome-flatfile";
import { fileFromSeedInputs } from "tome-flatfile";
import { invalidateDynamicPropertiesCache } from "../src/content/sync";
import { contentModelDir, workspaceFilePath } from "tome-flatfile";
import { defaultTestWorkspaceFile } from "../src/content/test-helpers";
import { serializeWorkspaceFile } from "tome-flatfile";
import { invalidateWorkspaceCache } from "tome-flatfile";
import { writeFileSync } from "node:fs";
import {
  associationsFilePath,
  emptyAssociationsFile,
  registerBidirectionalType,
  registerSetAssociation,
  serializeAssociationsFile,
  invalidateAssociationsCache,
} from "tome-flatfile";
import {
  TEST_MEMBER_OF_ASSOCIATION_ID,
  TEST_ORDERED_MEMBER_OF_ASSOCIATION_ID,
} from "../src/content/test-helpers";
import { GraphDatabase } from "tome-sqlite";
import { typeTableMarkerProperties } from "../src/node-capabilities";
import { buildPropertiesSection } from "../src/node-type-properties";
import { getNodePageDetail } from "../src/node-page-sections";

describe("node-type-properties", () => {
  const dir = mkdtempSync(join(tmpdir(), "tome-page-props-"));
  const dbPath = join(dir, "test.sqlite");
  const db = new GraphDatabase(dbPath);
  const contentDir = join(dir, "content");
  mkdirSync(contentDir, { recursive: true });
  mkdirSync(contentModelDir(contentDir), { recursive: true });
  writeFileSync(
    workspaceFilePath(contentDir),
    serializeWorkspaceFile(defaultTestWorkspaceFile()),
    "utf-8",
  );
  invalidateWorkspaceCache();
  {
    const registry = emptyAssociationsFile();
    registerSetAssociation(registry, {
      id: TEST_MEMBER_OF_ASSOCIATION_ID,
      perspectives: ["Members", "Membership"],
    });
    registerSetAssociation(registry, {
      id: TEST_ORDERED_MEMBER_OF_ASSOCIATION_ID,
      perspectives: ["Ordered members", "Ordered membership"],
      ordered: true,
    });
    // Direct cache edges use perspective "scenes"; register so page detail can resolve them.
    registerBidirectionalType(registry, "scenes", "scenes", "000000000000000000000000C3");
    writeFileSync(associationsFilePath(contentDir), serializeAssociationsFile(registry), "utf-8");
    invalidateAssociationsCache();
  }
  process.env.TOME_CONTENT_PATH = contentDir;

  const CHAR_DB = "00000000000000000000000035";
  const character = "CCCCCCCCCCCCCCCCCCCCCCCCCC";
  const scene1 = "11111111111111111111111111";
  const scene2 = "22222222222222222222222222";

  test("includes computed dynamic fields with allViews", () => {
    new ContentStore(contentDir).writeDynamicPropertiesFile(
      fileFromSeedInputs([
        {
          id: "props-all-scene",
          owner: CHAR_DB,
          columnKey: "all_scene_count",
          columnName: "All Scene count",
          resolverId: "characters.allSceneCount",
          params: {
            scenes_edge_label: "SCENES",
          },
        },
      ]),
    );
    invalidateDynamicPropertiesCache();
    db.upsertNode(CHAR_DB, {
      ...typeTableMarkerProperties("Characters"),
    });
    db.upsertNode(character, { title: "James" });
    db.upsertRelationship(character, CHAR_DB, projectionTypeForEndpoint(TEST_MEMBER_OF_ASSOCIATION_ID, 1), { row_index: 0, priority: "High" });

    db.upsertNode(scene1, { title: "Scene A" });
    db.upsertNode(scene2, { title: "Scene B" });
    db.upsertRelationship(character, scene1, "SCENES", {});
    db.upsertRelationship(character, scene2, "SCENES", {});

    const properties = buildPropertiesSection(db, character, contentDir);
    expect(properties).toMatchObject({
      databaseId: CHAR_DB,
      typeTitle: "Characters",
      cells: {
        priority: "High",
        all_scene_count: "2",
      },
    });
    expect(properties?.columnDefs?.some((col) => col.key === "all_scene_count")).toBe(true);
    expect(
      properties?.columnDefs?.find((col) => col.key === "all_scene_count")?.source,
    ).toBe("dynamic");
  });

  test("getNodePageDetail exposes properties alongside membership relation section", () => {
    new ContentStore(contentDir).writeDynamicPropertiesFile(
      fileFromSeedInputs([
        {
          id: "props-all-scene-2",
          owner: CHAR_DB,
          columnKey: "all_scene_count",
          columnName: "All Scene count",
          resolverId: "characters.allSceneCount",
                    params: {
            scenes_edge_label: "SCENES",
          },
        },
      ]),
    );
    invalidateDynamicPropertiesCache();
    const detail = getNodePageDetail(db, character, { contentDir });
    expect(detail?.properties?.cells.all_scene_count).toBe("2");
    const membership = detail?.sections.find(
      (section) => section.type === "relations" && section.label === projectionTypeForEndpoint(TEST_MEMBER_OF_ASSOCIATION_ID, 1),
    );
    expect(membership?.type === "relations" ? membership.rows : undefined).toEqual([
      { targetId: CHAR_DB, name: "Characters", cells: {} },
    ]);
  });

  afterAll(() => {
    delete process.env.TOME_CONTENT_PATH;
    invalidateDynamicPropertiesCache();
    invalidateWorkspaceCache();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
