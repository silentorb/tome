import { describe, expect, test } from "bun:test";
import {
  collapsePageBlockEmbedsForStorage,
  expandPageBlockFencesForEditor,
  extractStructuredProperties,
  formatPageBlockEmbedComment,
  normalizeLegacyBlockType,
  parsePageBlockFences,
  parsePageBlockPayload,
  replacePageBlockFencesWithPlaceholders,
  serializePageBlock,
  serializePageBlockInner,
  substitutePageBlockPlaceholders,
} from "../src/page-block";

describe("page-block parse", async () => {
  test("serialize and parse round-trip", () => {
    const fence = serializePageBlock("query", { x: 1 });
    expect(fence.startsWith("```json {type=\"query\"}\n")).toBe(true);
    const { segments } = parsePageBlockFences(`Hello\n\n${fence}\n\nWorld`);
    expect(segments).toHaveLength(3);
    expect(segments[0]).toEqual({ type: "prose", content: "Hello\n\n" });
    expect(segments[1]?.type).toBe("block");
    if (segments[1]?.type === "block") {
      expect(segments[1].payload).toEqual({
        blockType: "query",
        contentType: "json",
        data: { x: 1 },
      });
    }
    expect(segments[2]).toEqual({ type: "prose", content: "\n\nWorld" });
  });

  test("serializePageBlockInner is flattened data only", () => {
    const inner = serializePageBlockInner("query", { x: 1 });
    expect(inner).toBe(JSON.stringify({ x: 1 }, null, 2));
    expect(parsePageBlockPayload(inner)).toBeNull();
  });

  test("parsePageBlockPayload accepts new embed shape and legacy componentId", () => {
    expect(
      parsePageBlockPayload(
        JSON.stringify({ blockType: "query", contentType: "json", data: { x: 1 } }),
      ),
    ).toEqual({ blockType: "query", contentType: "json", data: { x: 1 } });
    expect(
      parsePageBlockPayload(JSON.stringify({ componentId: "tome-query.block", data: { x: 1 } })),
    ).toEqual({ blockType: "tome-query", contentType: "json", data: { x: 1 } });
    expect(parsePageBlockPayload("not json")).toBeNull();
    expect(parsePageBlockPayload('{"data":{}}')).toBeNull();
  });

  test("normalizeLegacyBlockType strips kind suffixes", () => {
    expect(normalizeLegacyBlockType("tome-query.block")).toBe("tome-query");
    expect(normalizeLegacyBlockType("tome-search-sqlite.searcher")).toBe("tome-search-sqlite");
    expect(normalizeLegacyBlockType("query")).toBe("query");
  });

  test("legacy tome-block fences still parse", () => {
    const legacy = [
      "```tome-block",
      JSON.stringify({ componentId: "tome-query.block", data: { version: 1 } }, null, 2),
      "```",
    ].join("\n");
    const { segments } = parsePageBlockFences(legacy);
    expect(segments).toHaveLength(1);
    expect(segments[0]?.type).toBe("block");
    if (segments[0]?.type === "block") {
      expect(segments[0].payload).toEqual({
        blockType: "tome-query",
        contentType: "json",
        data: { version: 1 },
      });
    }
  });

  test("ordinary json fences without type= stay prose", () => {
    const md = '```json\n{"a":1}\n```';
    const { segments } = parsePageBlockFences(md);
    expect(segments).toHaveLength(1);
    expect(segments[0]?.type).toBe("prose");
  });

  test("optional property id on fence meta round-trips", () => {
    const fence = serializePageBlock(
      "node-filter",
      { nodes: {}, edges: {} },
      "predicate",
    );
    expect(fence.startsWith('```json {#predicate type="node-filter"}\n')).toBe(true);
    const { segments } = parsePageBlockFences(fence);
    expect(segments).toHaveLength(1);
    expect(segments[0]?.type).toBe("block");
    if (segments[0]?.type === "block") {
      expect(segments[0].payload).toEqual({
        blockType: "node-filter",
        contentType: "json",
        data: { nodes: {}, edges: {} },
        propertyId: "predicate",
      });
    }
  });

  test("extractStructuredProperties filters by role and property id", () => {
    const md = [
      serializePageBlock("node-filter", { nodes: { a: 1 }, edges: {} }, "predicate"),
      "",
      serializePageBlock("query", { version: 1 }, "other"),
    ].join("\n");
    const props = extractStructuredProperties(md, "node-filter");
    expect([...props.keys()]).toEqual(["predicate"]);
    expect(props.get("predicate")?.data).toEqual({ nodes: { a: 1 }, edges: {} });
  });

  test("expand and collapse round-trip for editor embeds", async () => {
    const fence = serializePageBlock("query", { x: 1 });
    const source = `Hello\n\n${fence}\n\nWorld`;
    const expanded = await expandPageBlockFencesForEditor(source, async (payload) => {
      return `<figure class="demo">${payload.blockType}</figure>`;
    });
    expect(expanded).toContain(
      formatPageBlockEmbedComment({
        blockType: "query",
        contentType: "json",
        data: { x: 1 },
      }),
    );
    expect(expanded).toContain('<figure class="demo">query</figure>');
    expect(collapsePageBlockEmbedsForStorage(expanded)).toBe(source);
  });

  test("collapsePageBlockEmbedsForStorage keeps invalid comments unchanged", () => {
    const input = "<!-- tome-page-block not-json --><figure>x</figure>";
    expect(collapsePageBlockEmbedsForStorage(input)).toBe(input);
  });

  test("placeholder substitution", () => {
    const input = `Before\n\n${serializePageBlock("a", {})}\n\nAfter`;
    const { markdown, blocks } = replacePageBlockFencesWithPlaceholders(input);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.blockType).toBe("a");
    expect(markdown).toContain("<!-- tome-page-block:0 -->");
    const html = substitutePageBlockPlaceholders(
      "<p>Before</p><!-- tome-page-block:0 --><p>After</p>",
      ['<div class="block">x</div>'],
    );
    expect(html).toContain('<div class="block">x</div>');
    expect(html).not.toContain("tome-page-block");
  });
});
