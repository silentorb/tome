import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { GraphDatabase } from "../../src/graph";
import { MEMBER_OF_TYPE } from "../../src/labels";
import { typeTableMarkerProperties } from "../../src/node-capabilities";
import { schemaFilePath } from "../../src/content/paths";
import { loadSchemaFromContent, invalidateSchemaCache } from "../../src/schema-rules/load";
import { relationshipRuleContextForType, resolveRelationshipRule } from "../../src/schema-rules/resolve";
import { parseSchemaFile } from "../../src/schema-rules/schema-file";

function marlothContentPathForIntegrationTest(): string | null {
  if (process.env.TOME_CONTENT_PATH) {
    return process.env.TOME_CONTENT_PATH;
  }

  let dir = resolve(import.meta.dir, "../..");
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = resolve(dir, "repos/marloth-story/content");
    if (existsSync(schemaFilePath(candidate))) {
      return candidate;
    }
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }

  return null;
}

describe("schema rules", () => {
  test("parseSchemaFile validates relationship rules", () => {
    const file = parseSchemaFile(
      JSON.stringify({
        version: 1,
        relationshipRules: [
          {
            id: "test",
            sourceTypeId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            label: "features",
            allowedTargetTypeIds: ["bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"],
          },
        ],
      }),
    );
    expect(file.relationshipRules[0]?.type).toBe("features");
  });

  test("resolveRelationshipRule matches source type membership", () => {
    const db = new GraphDatabase(":memory:", { clean: true });
    const scenesType = "204dba198db74611b0b49a98dd53e8f5";
    const featuresType = "dd0de9867cc345b898929306bdf9fc83";
    const scene = "cccccccccccccccccccccccccccccccc";

    db.upsertNode(scenesType, typeTableMarkerProperties("Scenes"));
    db.upsertNode(featuresType, typeTableMarkerProperties("Features"));
    db.upsertNode(scene, { title: "Test scene" });
    db.upsertRelationship(scene, scenesType, MEMBER_OF_TYPE, {});

    const schema = parseSchemaFile(
      JSON.stringify({
        version: 1,
        relationshipRules: [
          {
            id: "scene-features",
            sourceTypeId: scenesType,
            type: "includes",
            allowedTargetTypeIds: [featuresType],
          },
        ],
      }),
    );

    const rule = resolveRelationshipRule(schema, db, scene, "features");
    expect(rule?.id).toBe("scene-features");

    const context = relationshipRuleContextForType(schema, db, scene, "features");
    expect(context?.allowedTargetTypeIds).toEqual([featuresType]);
  });

  test("loadSchemaFromContent reads repo schema.json", () => {
    const contentPath = marlothContentPathForIntegrationTest();
    if (!contentPath) {
      return;
    }
    invalidateSchemaCache();
    const schema = loadSchemaFromContent(contentPath);
    expect(schema.relationshipRules.length).toBeGreaterThan(0);
    expect(schema.enums.priority?.options).toEqual([
      "Consideration",
      "Low",
      "Medium",
      "High",
      "Primary",
    ]);
    expect(schema.enums.priority?.defaultOrder).toBe("desc");
    expect(schema.enums.priority?.values?.High).toBe(4);
  });

  test("parseSchemaFile validates enums", () => {
    const file = parseSchemaFile(
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
    expect(file.enums.priority?.default).toBe("Low");
  });

  test("parseSchemaFile rejects invalid enum default", () => {
    expect(() =>
      parseSchemaFile(
        JSON.stringify({
          version: 1,
          relationshipRules: [],
          enums: {
            priority: {
              options: ["Low", "Medium"],
              default: "High",
            },
          },
        }),
      ),
    ).toThrow(/default must be one of options/);
  });

  test("parseSchemaFile rejects values key not in options", () => {
    expect(() =>
      parseSchemaFile(
        JSON.stringify({
          version: 1,
          relationshipRules: [],
          enums: {
            priority: {
              options: ["Low", "Medium"],
              default: "Low",
              values: { Ultimate: 8 },
            },
          },
        }),
      ),
    ).toThrow(/values key "Ultimate" is not in options/);
  });

  test("parseSchemaFile defaults defaultOrder to asc when omitted", () => {
    const file = parseSchemaFile(
      JSON.stringify({
        version: 1,
        relationshipRules: [],
        enums: {
          priority: {
            options: ["Low", "Medium"],
            default: "Low",
          },
        },
      }),
    );
    expect(file.enums.priority?.defaultOrder).toBe("asc");
  });

  test("parseSchemaFile accepts defaultOrder desc", () => {
    const file = parseSchemaFile(
      JSON.stringify({
        version: 1,
        relationshipRules: [],
        enums: {
          priority: {
            options: ["Low", "Medium"],
            default: "Low",
            defaultOrder: "desc",
          },
        },
      }),
    );
    expect(file.enums.priority?.defaultOrder).toBe("desc");
  });

  test("parseSchemaFile rejects invalid defaultOrder", () => {
    expect(() =>
      parseSchemaFile(
        JSON.stringify({
          version: 1,
          relationshipRules: [],
          enums: {
            priority: {
              options: ["Low", "Medium"],
              default: "Low",
              defaultOrder: "newest",
            },
          },
        }),
      ),
    ).toThrow(/defaultOrder must be "asc" or "desc"/);
  });
});
