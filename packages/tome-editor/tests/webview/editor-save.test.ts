import { describe, expect, test } from "bun:test";
import {
  expandPageBlockFencesForEditor,
  formatPageBlockEmbedComment,
  serializePageBlock,
} from "tome-interfaces/page-block";
import { bodyNeedsSave, normalizeEditorBody, titleNeedsSave } from "../../src/webview/editor-save";

describe("normalizeEditorBody", () => {
  test("strips duplicate page title before compare", () => {
    expect(normalizeEditorBody("# Alpha\n\nNotes", "Alpha")).toBe("Notes");
  });

  test("collapses server-rendered page block embeds to fences", async () => {
    const fence = serializePageBlock("demo.block", { x: 1 });
    const expanded = await expandPageBlockFencesForEditor(fence, async () => {
      return '<figure class="demo">block</figure>';
    });
    expect(normalizeEditorBody(expanded, "Page")).toBe(fence);
  });

  test("preserves page block metadata comment through collapse", () => {
    const fence = serializePageBlock("demo.block", { x: 1 });
    const embed =
      `${formatPageBlockEmbedComment({ componentId: "demo.block", data: { x: 1 } })}\n` +
      '<figure class="demo">block</figure>';
    expect(normalizeEditorBody(embed, "Page")).toBe(fence);
  });

  test("canonicalizes node links to relative sibling paths", () => {
    const id = "28358e628ba2807fb560caaac1c4aa47";
    const body = `[Action](http://127.0.0.1:5173/?node=${id})`;
    expect(normalizeEditorBody(body, "Page")).toBe(`[Action](./${id}.md)`);
  });

  test("collapses dynamic editor links to storage syntax", () => {
    const id = "28358e628ba2807fb560caaac1c4aa47";
    const body = `[Target](?dynnode=${id})`;
    expect(normalizeEditorBody(body, "Page")).toBe(`[[${id}]]`);
  });
});

describe("bodyNeedsSave", () => {
  test("returns false when normalized body matches saved baseline", () => {
    expect(bodyNeedsSave("# Alpha\n\nNotes", "Notes", "Alpha")).toBe(false);
  });

  test("returns true when content changed", () => {
    expect(bodyNeedsSave("# Alpha\n\nMore notes", "Notes", "Alpha")).toBe(true);
  });

  test("returns false when saved baseline is unset", () => {
    expect(bodyNeedsSave("Notes", null, "Alpha")).toBe(false);
  });
});

describe("titleNeedsSave", () => {
  test("returns false when title unchanged", () => {
    expect(titleNeedsSave("Alpha", "Alpha")).toBe(false);
  });

  test("returns false for trailing space only (trimmed title unchanged)", () => {
    expect(titleNeedsSave("Alpha ", "Alpha")).toBe(false);
  });

  test("returns true when title changed", () => {
    expect(titleNeedsSave("Beta", "Alpha")).toBe(true);
  });
});
