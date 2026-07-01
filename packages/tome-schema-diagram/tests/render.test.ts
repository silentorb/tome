import { describe, expect, test } from "bun:test";
import { parseSchemaDiagramConfig } from "../src/config";
import { measureEdgeLabelSize } from "../src/build-elk-graph";
import { renderSchemaDiagramHtml } from "../src/render";
import { renderSchemaDiagramSvg } from "../src/render-svg";

const SCHEMA_QUERY = {
  listTypeTables: () => [{ id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", title: "Scene" }],
  listRelationshipRules: () => [],
  listRelationColumnEdges: () => [
    {
      id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:features",
      sourceTypeId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      targetTypeId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      label: "features",
    },
  ],
};

describe("schema diagram render", () => {
  test("editor shell emits inline SVG in viewport", async () => {
    const html = await renderSchemaDiagramHtml(
      {
        ...SCHEMA_QUERY,
        listTypeTables: () => [
          { id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", title: "Scene" },
          { id: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", title: "Feature" },
        ],
      },
      {},
      "Schema diagram",
    );
    expect(html).toContain('class="tome-schema-diagram"');
    expect(html).toContain('class="tome-schema-diagram-viewport"');
    expect(html).toContain("<svg");
    expect(html).toContain("Scene");
    expect(html).toContain("Feature");
    expect(html).not.toContain("mermaid");
  });

  test("static and editor modes share the same HTML renderer", async () => {
    const html = await renderSchemaDiagramHtml(SCHEMA_QUERY, {}, "Schema diagram");
    expect(html).toContain("<svg");
    expect(html).not.toContain("open in the editor");
  });

  test("renderSchemaDiagramSvg produces labeled graph svg", async () => {
    const result = await renderSchemaDiagramSvg(
      {
        typeTables: [
          { id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", title: "Scene" },
          { id: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", title: "Feature" },
        ],
        relationColumnEdges: [
          {
            id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:features",
            sourceTypeId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            targetTypeId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            label: "features",
          },
        ],
      },
      parseSchemaDiagramConfig({}),
    );
    expect(result).not.toBeNull();
    expect(result!.entityCount).toBe(2);
    expect(result!.edgeCount).toBe(1);
    expect(result!.svg).toContain("Scene");
    expect(result!.svg).toContain("Feature");
    expect(result!.svg).toContain("features");
    expect(result!.svg).toContain('class="schema-diagram-node"');
    expect(result!.svg).toContain('class="schema-diagram-edge"');
  });

  test("edge label background fits long perspective names", async () => {
    const result = await renderSchemaDiagramSvg(
      {
        typeTables: [
          { id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", title: "Scene" },
          { id: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", title: "Feature" },
        ],
        relationColumnEdges: [
          {
            id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:character_attributes",
            sourceTypeId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            targetTypeId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            label: "character_attributes",
          },
        ],
      },
      parseSchemaDiagramConfig({}),
    );
    expect(result).not.toBeNull();
    const { width } = measureEdgeLabelSize("character_attributes");
    expect(result!.svg).toContain(`width="${width}"`);
    expect(result!.svg).toContain("character_attributes");
  });

  test("parseSchemaDiagramConfig defaults", () => {
    const config = parseSchemaDiagramConfig({});
    expect(config.typeIds).toBeNull();
    expect(config.relationshipTypes).toBeNull();
    expect(config.theme).toBe("default");
    expect(config.direction).toBe("TB");
  });
});
