import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { GraphDatabase } from "../../src/graph";
import { ORDERED_MEMBER_OF_TYPE } from "../../src/labels";
import { typeTableMarkerProperties } from "../../src/node-capabilities";
import { schemaFilePath } from "../../src/content/paths";
import { relationshipTypeRuleContext } from "../../src/relationship-type-endpoints";
import { loadRelationshipTypesFromContent } from "../../src/relationship-types/load";
import { loadSchemaFromContent, invalidateSchemaCache } from "../../src/schema-rules/load";
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
            sourceTypeId: "AAAAAAAAAAAAAAAAAAAAAAAAAA",
            label: "features",
            allowedTargetTypeIds: ["BBBBBBBBBBBBBBBBBBBBBBBBBB"],
          },
        ],
      }),
    );
    expect(file.relationshipRules[0]?.type).toBe("features");
  });

  test("parseSchemaFile allows absent relationshipRules", () => {
    const file = parseSchemaFile(JSON.stringify({ version: 1, enums: {} }));
    expect(file.relationshipRules).toEqual([]);
  });

  test("relationshipTypeRuleContext reads allowed targets from relationship-types endpoints", () => {
    const previousContentPath = process.env.TOME_CONTENT_PATH;
    process.env.TOME_CONTENT_PATH = "/workspaces/marloth-story/content";

    const db = new GraphDatabase(":memory:", { clean: true });
    const scenesType = "01KWN86X6NJZMP5ZESZTNDXY8C";
    const featuresType = "01KWN86X6NJZMP5ZESZTNDXY4Q";
    const featureRow = "CCCCCCCCCCCCCCCCCCCCCCCCCC";

    db.upsertNode(scenesType, typeTableMarkerProperties("Scenes"));
    db.upsertNode(featuresType, typeTableMarkerProperties("Features test"));
    db.upsertNode(featureRow, { title: "Test feature" });
    db.upsertRelationship(featureRow, featuresType, ORDERED_MEMBER_OF_TYPE, {});

    const registry = loadRelationshipTypesFromContent("/workspaces/marloth-story/content");
    const context = relationshipTypeRuleContext(
      registry,
      db,
      featureRow,
      "features_test",
      "/workspaces/marloth-story/content",
    );
    expect(context?.compositeType).toBe("scenes_features_test");
    expect(context?.allowedTargetTypeIds).toEqual([scenesType]);

    if (previousContentPath === undefined) {
      delete process.env.TOME_CONTENT_PATH;
    } else {
      process.env.TOME_CONTENT_PATH = previousContentPath;
    }
  });

  test("loadSchemaFromContent reads repo schema.json", () => {
    const previousContentPath = process.env.TOME_CONTENT_PATH;
    process.env.TOME_CONTENT_PATH = "/workspaces/marloth-story/content";
    invalidateSchemaCache();
    const schema = loadSchemaFromContent("/workspaces/marloth-story/content");
    expect(schema.relationshipRules).toEqual([]);
    expect(schema.enums.priority?.options).toEqual([
      "Consideration",
      "Low",
      "Medium",
      "High",
      "Primary",
    ]);
    expect(schema.enums.priority?.defaultOrder).toBe("desc");
    expect(schema.enums.priority?.values?.High).toBe(4);

    if (previousContentPath === undefined) {
      delete process.env.TOME_CONTENT_PATH;
    } else {
      process.env.TOME_CONTENT_PATH = previousContentPath;
    }
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
