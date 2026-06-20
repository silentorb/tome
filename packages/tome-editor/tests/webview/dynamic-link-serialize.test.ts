import { describe, expect, test } from "bun:test";
import { defaultValueCtx, Editor, rootCtx } from "@milkdown/core";
import { getMarkdown } from "@milkdown/kit/utils";
import { gfm } from "@milkdown/preset-gfm";
import { commonmark } from "@milkdown/preset-commonmark";
import { editorDynamicNodeHref } from "tome-db/dynamic-node-links";
import { formatEditorDynamicNodeLink } from "../../src/webview/standalone-markdown";
import { normalizeEditorBody } from "../../src/webview/editor-save";

const TARGET = "e5cc80dc61ed4c629951cdf472b20b7a";

describe("dynamic link milkdown serialization", () => {
  test("GFM getMarkdown preserves dynnode href and save collapses to [[id]]", async () => {
    const link = formatEditorDynamicNodeLink(TARGET, "Cozy horror");
    const root = document.createElement("div");
    document.body.appendChild(root);
    const editor = await Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, link);
      })
      .use(commonmark)
      .use(gfm)
      .create();
    let md = "";
    await editor.action((ctx) => {
      md = getMarkdown()(ctx);
    });
    expect(md).toContain("dynnode=");
    expect(md).not.toContain("\\&");
    expect(normalizeEditorBody(md.trim(), "Page")).toBe(`[[${TARGET}]]`);
    await editor.destroy();
  });

  test("legacy GFM-escaped &dynamic=1 still collapses on save", () => {
    const md = `[Cozy horror](?node=${TARGET}\\&dynamic=1)`;
    expect(normalizeEditorBody(md, "Page")).toBe(`[[${TARGET}]]`);
  });

  test("normalizeEditorBody saves static when dynamic marker missing", () => {
    const md = `[Cozy horror](http://127.0.0.1:5173/?node=${TARGET})`;
    expect(normalizeEditorBody(md, "Page")).toBe(`[Cozy horror](./${TARGET}.md)`);
  });

  test("dynnode href format", () => {
    expect(editorDynamicNodeHref(TARGET)).toBe(`?dynnode=${TARGET}`);
  });
});
