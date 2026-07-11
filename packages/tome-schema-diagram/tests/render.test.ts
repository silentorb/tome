import { describe, expect, test } from "bun:test";
import { parseSchemaDiagramConfig } from "../src/config";
import { measureEdgeLabelSize } from "../src/build-elk-graph";
import { renderSchemaDiagramHtml } from "../src/render";
import { renderSchemaDiagramSvg } from "../src/render-svg";

const SCHEMA_QUERY = {
  listTypeTables: () => [{ id: "AAAAAAAAAAAAAAAAAAAAAAAAAA", title: "Scene" }],
  listRelationshipRules: () => [],
  listRelationColumnEdges: () => [
    {
      id: "AAAAAAAAAAAAAAAAAAAAAAAAAA:features",
      sourceTypeId: "AAAAAAAAAAAAAAAAAAAAAAAAAA",
      targetTypeId: "BBBBBBBBBBBBBBBBBBBBBBBBBB",
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
          { id: "AAAAAAAAAAAAAAAAAAAAAAAAAA", title: "Scene" },
          { id: "BBBBBBBBBBBBBBBBBBBBBBBBBB", title: "Feature" },
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
          { id: "AAAAAAAAAAAAAAAAAAAAAAAAAA", title: "Scene" },
          { id: "BBBBBBBBBBBBBBBBBBBBBBBBBB", title: "Feature" },
        ],
        relationColumnEdges: [
          {
            id: "AAAAAAAAAAAAAAAAAAAAAAAAAA:features",
            sourceTypeId: "AAAAAAAAAAAAAAAAAAAAAAAAAA",
            targetTypeId: "BBBBBBBBBBBBBBBBBBBBBBBBBB",
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

  test("renders member count badge when type table has members", async () => {
    const result = await renderSchemaDiagramSvg(
      {
        typeTables: [
          { id: "AAAAAAAAAAAAAAAAAAAAAAAAAA", title: "Scene", memberCount: 3 },
          { id: "BBBBBBBBBBBBBBBBBBBBBBBBBB", title: "Feature", memberCount: 0 },
        ],
        relationColumnEdges: [],
      },
      parseSchemaDiagramConfig({}),
    );
    expect(result).not.toBeNull();
    expect(result!.svg).toContain('class="schema-diagram-member-badge"');
    expect(result!.svg).toContain(">3</text>");
    expect(result!.svg.match(/schema-diagram-member-badge/g)?.length).toBe(1);
  });

  test("hides member badge when count is zero", async () => {
    const result = await renderSchemaDiagramSvg(
      {
        typeTables: [{ id: "AAAAAAAAAAAAAAAAAAAAAAAAAA", title: "Scene", memberCount: 0 }],
        relationColumnEdges: [],
      },
      parseSchemaDiagramConfig({}),
    );
    expect(result).not.toBeNull();
    expect(result!.svg).not.toContain("schema-diagram-member-badge");
  });

  test("edge label background fits long perspective names", async () => {
    const result = await renderSchemaDiagramSvg(
      {
        typeTables: [
          { id: "AAAAAAAAAAAAAAAAAAAAAAAAAA", title: "Scene" },
          { id: "BBBBBBBBBBBBBBBBBBBBBBBBBB", title: "Feature" },
        ],
        relationColumnEdges: [
          {
            id: "AAAAAAAAAAAAAAAAAAAAAAAAAA:character_attributes",
            sourceTypeId: "AAAAAAAAAAAAAAAAAAAAAAAAAA",
            targetTypeId: "BBBBBBBBBBBBBBBBBBBBBBBBBB",
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
    expect(config.perspectives).toBeNull();
    expect(config.theme).toBe("default");
    expect(config.direction).toBe("TB");
    expect(config.memberBadgePosition).toBe("bottom-right");
  });

  test("parseSchemaDiagramConfig uses workspace member badge position", () => {
    const config = parseSchemaDiagramConfig({}, { memberBadgePosition: "top-left" });
    expect(config.memberBadgePosition).toBe("top-left");
  });

  test("renders bidirectional edges with combined label and arrowheads at both ends", async () => {
    const result = await renderSchemaDiagramSvg(
      {
        typeTables: [
          { id: "AAAAAAAAAAAAAAAAAAAAAAAAAA", title: "Product" },
          { id: "BBBBBBBBBBBBBBBBBBBBBBBBBB", title: "Character" },
        ],
        relationColumnEdges: [
          {
            id: "AAAAAAAAAAAAAAAAAAAAAAAAAA:characters",
            sourceTypeId: "AAAAAAAAAAAAAAAAAAAAAAAAAA",
            targetTypeId: "BBBBBBBBBBBBBBBBBBBBBBBBBB",
            label: "characters",
          },
          {
            id: "BBBBBBBBBBBBBBBBBBBBBBBBBB:products",
            sourceTypeId: "BBBBBBBBBBBBBBBBBBBBBBBBBB",
            targetTypeId: "AAAAAAAAAAAAAAAAAAAAAAAAAA",
            label: "products",
          },
        ],
      },
      parseSchemaDiagramConfig({}),
    );
    expect(result).not.toBeNull();
    expect(result!.edgeCount).toBe(1);
    expect(result!.svg).toContain("products ↔ characters");
    const edgeGroup = result!.svg.match(/<g class="schema-diagram-edge">[\s\S]*?<\/g>/);
    expect(edgeGroup).not.toBeNull();
    expect(edgeGroup![0]!.match(/<polygon/g)?.length).toBe(2);
  });
});
