import { describe, expect, test } from "bun:test";
import { defaultValueCtx, Editor, rootCtx } from "@milkdown/core";
import { editorViewCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { gfm } from "@milkdown/preset-gfm";
import { getMarkdown } from "@milkdown/kit/utils";
import { formatPageBlockEmbedComment, serializePageBlock } from "tome-interfaces/page-block";
import { normalizeEditorBody } from "../../src/webview/editor-save";
import { pageBlockEmbed } from "../../src/webview/extensions/page-block-embed";

async function createEditor(initial: string) {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, initial);
    })
    .use(commonmark)
    .use(gfm)
    .use(pageBlockEmbed)
    .create();
  return { editor, root };
}

describe("page block embed rendering", () => {
  test("renders embedded page block HTML instead of raw markup", async () => {
    const embed =
      `${formatPageBlockEmbedComment({ componentId: "spatial-graph.block", data: {} })}\n` +
      '<figure class="tome-spatial-graph"><figcaption>Spatial graph</figcaption>' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect width="100" height="50"/></svg></figure>';

    const { editor, root } = await createEditor(embed);

    expect(root.querySelector(".tome-spatial-graph svg rect")).toBeTruthy();
    expect(root.textContent).not.toContain("<figure class=\"tome-spatial-graph\">");

    await editor.destroy();
  });

  test("round-trips page block embeds back to storage fences on save", async () => {
    const fence = serializePageBlock("spatial-graph.block", { relationships: { parentTypes: ["parents"] } });
    const embed =
      `${formatPageBlockEmbedComment({ componentId: "spatial-graph.block", data: { relationships: { parentTypes: ["parents"] } } })}\n` +
      '<figure class="tome-spatial-graph"><figcaption>Spatial graph</figcaption></figure>';

    const { editor } = await createEditor(embed);

    const markdown = await editor.action(getMarkdown());
    expect(normalizeEditorBody(markdown, "Locations")).toBe(fence);

    await editor.destroy();
  });

  test("preserves page block node in the ProseMirror document", async () => {
    const embed =
      `${formatPageBlockEmbedComment({ componentId: "demo.block", data: { x: 1 } })}\n` +
      '<figure class="demo">block</figure>';

    const { editor } = await createEditor(embed);

    await editor.action((ctx) => {
      let found = false;
      ctx.get(editorViewCtx).state.doc.descendants((node) => {
        if (node.type.name === "tome_page_block") found = true;
      });
      expect(found).toBe(true);
    });

    await editor.destroy();
  });
});
