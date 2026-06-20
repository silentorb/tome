import { describe, expect, test } from "bun:test";
import {
  parsePageBlockFences,
  parsePageBlockPayload,
  replacePageBlockFencesWithPlaceholders,
  serializePageBlock,
  substitutePageBlockPlaceholders,
} from "../src/page-block/parse";

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

  test("parsePageBlockPayload rejects invalid json", () => {
    expect(parsePageBlockPayload("not json")).toBeNull();
    expect(parsePageBlockPayload('{"data":{}}')).toBeNull();
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
