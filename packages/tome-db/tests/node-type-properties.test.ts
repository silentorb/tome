import { describe, expect, test, afterAll } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ContentStore } from "../src/content/store";
import { fileFromSeedInputs } from "../src/content/dynamic-fields-file";
import { invalidateDynamicFieldsCache } from "../src/content/sync";
import { contentModelDir, workspaceFilePath } from "../src/content/paths";
import { defaultTestWorkspaceFile } from "../src/content/test-helpers";
import { serializeWorkspaceFile } from "../src/workspace/workspace-file";
import { invalidateWorkspaceCache } from "../src/workspace/load";
import { writeFileSync } from "node:fs";
import { GraphDatabase } from "../src/graph";
import { IS_A_TYPE } from "../src/labels";
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
  process.env.TOME_CONTENT_PATH = contentDir;

  const CHAR_DB = "f984a934ad644f8480b0f8f51449569f";
  const character = "cccccccccccccccccccccccccccccccc";
  const scene1 = "11111111111111111111111111111111";
  const scene2 = "22222222222222222222222222222222";

  test("includes computed dynamic fields with allViews", () => {
    new ContentStore(contentDir).writeDynamicFieldsFile(
      fileFromSeedInputs([
        {
          id: "props-all-scene",
          databaseId: CHAR_DB,
          columnKey: "all_scene_count",
          columnName: "All Scene count",
          resolverId: "characters.allSceneCount",
          docsPath: "docs/dynamic-fields/characters.all-scene-count.md",
          viewNames: ["Hidden View"],
          params: {
            scenes_edge_label: "SCENES",
          },
        },
      ]),
    );
    invalidateDynamicFieldsCache();
    db.upsertNode(CHAR_DB, {
      ...typeTableMarkerProperties("Characters"),
      notion_schema: JSON.stringify({
        syncedAt: "test",
        properties: {
          Name: { id: "title", name: "Name", type: "title", config: {} },
          Priority: { id: "Vpkf", name: "Priority", type: "select", config: {} },
        },
      }),
    });
    db.upsertNode(character, { title: "James" });
    db.upsertRelationship(character, CHAR_DB, IS_A_TYPE, { row_index: 0, priority: "High" });

    db.upsertNode(scene1, { title: "Scene A" });
    db.upsertNode(scene2, { title: "Scene B" });
    db.upsertRelationship(character, scene1, "SCENES", {});
    db.upsertRelationship(character, scene2, "SCENES", {});

    const properties = buildPropertiesSection(db, character);
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

  test("getNodePageDetail exposes properties and IS_A relation section", () => {
    new ContentStore(contentDir).writeDynamicFieldsFile(
      fileFromSeedInputs([
        {
          id: "props-all-scene-2",
          databaseId: CHAR_DB,
          columnKey: "all_scene_count",
          columnName: "All Scene count",
          resolverId: "characters.allSceneCount",
          docsPath: "docs/dynamic-fields/characters.all-scene-count.md",
          params: {
            scenes_edge_label: "SCENES",
          },
        },
      ]),
    );
    invalidateDynamicFieldsCache();
    const detail = getNodePageDetail(db, character);
    expect(detail?.properties?.cells.all_scene_count).toBe("2");
    const membership = detail?.sections.find(
      (section) => section.type === "relations" && section.label === IS_A_TYPE,
    );
    expect(membership).toMatchObject({
      label: IS_A_TYPE,
      addMode: "link-existing",
      columns: [],
    });
  });

  afterAll(() => {
    delete process.env.TOME_CONTENT_PATH;
    invalidateDynamicFieldsCache();
    invalidateWorkspaceCache();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
