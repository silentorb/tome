import { describe, expect, test } from "bun:test";
import { parseSchemaDiagramConfig } from "../src/config";
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

  test("renderSchemaDiagramSvg produces unlabeled edge graph svg", async () => {
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
      (nodeId) => `?node=${nodeId}`,
    );
    expect(result).not.toBeNull();
    expect(result!.entityCount).toBe(2);
    expect(result!.edgeCount).toBe(1);
    expect(result!.svg).toContain("Scene");
    expect(result!.svg).toContain("Feature");
    expect(result!.svg).not.toContain("features");
    expect(result!.svg).toContain('class="schema-diagram-node"');
    expect(result!.svg).toContain('class="schema-diagram-edge"');
    expect(result!.svg).toContain('class="schema-diagram-node-link"');
    expect(result!.svg).toContain('href="?node=AAAAAAAAAAAAAAAAAAAAAAAAAA"');
    expect(result!.svg).toContain('href="?node=BBBBBBBBBBBBBBBBBBBBBBBBBB"');
    expect(result!.svg).toContain('data-node-id="AAAAAAAAAAAAAAAAAAAAAAAAAA"');
  });

  test("omits node links when nodePageHref is not provided", async () => {
    const result = await renderSchemaDiagramSvg(
      {
        typeTables: [
          { id: "AAAAAAAAAAAAAAAAAAAAAAAAAA", title: "Scene" },
          { id: "BBBBBBBBBBBBBBBBBBBBBBBBBB", title: "Feature" },
        ],
        relationColumnEdges: [],
      },
      parseSchemaDiagramConfig({}),
    );
    expect(result).not.toBeNull();
    expect(result!.svg).not.toContain("schema-diagram-node-link");
    expect(result!.svg).not.toContain("href=");
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

  test("renders bidirectional edges with arrowheads at both ends and no labels", async () => {
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
    expect(result!.svg).not.toContain("products");
    expect(result!.svg).not.toContain("characters");
    expect(result!.svg).not.toContain("↔");
    const edgeGroup = result!.svg.match(/<g class="schema-diagram-edge">[\s\S]*?<\/g>/);
    expect(edgeGroup).not.toBeNull();
    expect(edgeGroup![0]!.match(/<polygon/g)?.length).toBe(2);
  });
});
