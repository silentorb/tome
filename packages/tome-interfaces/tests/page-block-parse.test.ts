import { describe, expect, test } from "bun:test";
import {
  collapsePageBlockEmbedsForStorage,
  expandPageBlockFencesForEditor,
  formatPageBlockEmbedComment,
  parsePageBlockFences,
  parsePageBlockPayload,
  replacePageBlockFencesWithPlaceholders,
  serializePageBlock,
  serializePageBlockInner,
  substitutePageBlockPlaceholders,
} from "../src/page-block";

describe("page-block parse", () => {
  test("serialize and parse round-trip", () => {
    const fence = serializePageBlock("demo.block", { x: 1 });
    const { segments } = parsePageBlockFences(`Hello\n\n${fence}\n\nWorld`);
    expect(segments).toHaveLength(3);
    expect(segments[0]).toEqual({ type: "prose", content: "Hello\n\n" });
    expect(segments[1]?.type).toBe("block");
    if (segments[1]?.type === "block") {
      expect(segments[1].payload).toEqual({ componentId: "demo.block", data: { x: 1 } });
    }
    expect(segments[2]).toEqual({ type: "prose", content: "\n\nWorld" });
  });

  test("serializePageBlockInner round-trips via parsePageBlockPayload", () => {
    const inner = serializePageBlockInner("demo.block", { x: 1 });
    expect(parsePageBlockPayload(inner)).toEqual({ componentId: "demo.block", data: { x: 1 } });
  });

  test("parsePageBlockPayload rejects invalid json", () => {
    expect(parsePageBlockPayload("not json")).toBeNull();
    expect(parsePageBlockPayload('{"data":{}}')).toBeNull();
  });

  test("expand and collapse round-trip for editor embeds", async () => {
    const fence = serializePageBlock("demo.block", { x: 1 });
    const source = `Hello\n\n${fence}\n\nWorld`;
    const expanded = await expandPageBlockFencesForEditor(source, async (payload) => {
      return `<figure class="demo">${payload.componentId}</figure>`;
    });
    expect(expanded).toContain(formatPageBlockEmbedComment({ componentId: "demo.block", data: { x: 1 } }));
    expect(expanded).toContain('<figure class="demo">demo.block</figure>');
    expect(collapsePageBlockEmbedsForStorage(expanded)).toBe(source);
  });

  test("collapsePageBlockEmbedsForStorage keeps invalid comments unchanged", () => {
    const input = '<!-- tome-page-block not-json --><figure>x</figure>';
    expect(collapsePageBlockEmbedsForStorage(input)).toBe(input);
  });

  test("placeholder substitution", () => {
    const input = `Before\n\n${serializePageBlock("a", {})}\n\nAfter`;
    const { markdown, blocks } = replacePageBlockFencesWithPlaceholders(input);
    expect(blocks).toHaveLength(1);
    expect(markdown).toContain("<!-- tome-page-block:0 -->");
    const html = substitutePageBlockPlaceholders(
      "<p>Before</p><!-- tome-page-block:0 --><p>After</p>",
      ['<div class="block">x</div>'],
    );
    expect(html).toContain('<div class="block">x</div>');
    expect(html).not.toContain("tome-page-block");
  });
});
