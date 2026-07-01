import { describe, expect, test, mock } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { defaultValueCtx, Editor, rootCtx } from "@milkdown/core";
import { editorViewCtx } from "@milkdown/kit/core";
import { TextSelection } from "@milkdown/prose/state";
import { commonmark } from "@milkdown/preset-commonmark";
import { gfm } from "@milkdown/preset-gfm";
import { getMarkdown } from "@milkdown/kit/utils";
import { serializePageBlock } from "tome-interfaces/page-block";
import { normalizeEditorBody } from "../../src/webview/editor-save";

try {
  GlobalRegistrator.register();
} catch {
  // already registered by another test file
}

mock.module("svg-pan-zoom", () => ({
  default: () => ({
    destroy: () => {},
    fit: () => {},
    center: () => {},
    resize: () => {},
    zoomIn: () => {},
    zoomOut: () => {},
  }),
}));

const { insertPageBlock } = await import("../../src/webview/extensions/page-block-menu");

async function createEditor(initial = "") {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, initial);
    })
    .use(commonmark)
    .use(gfm)
    .create();
  return { editor, root };
}

describe("insertPageBlock slash menu", () => {
  test("replaces slash filter text with a tome-block fence", async () => {
    const { editor } = await createEditor();

    await editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const tr = view.state.tr.insertText("/sch", 1);
      const end = 1 + "/sch".length;
      view.dispatch(tr.setSelection(TextSelection.create(tr.doc, end)));
    });

    await editor.action((ctx) => {
      insertPageBlock(ctx, {
        id: "schema-diagram.block",
        extensionId: "schema-diagram",
        implementationId: "schema-diagram",
        label: "Schema diagram",
        insertDefaultData: () => ({}),
      });
    });

    const markdown = await editor.action((ctx) => getMarkdown()(ctx));
    const normalized = normalizeEditorBody(markdown, "Test");
    expect(normalized).toContain("```tome-block");
    expect(normalized).toContain('"componentId": "schema-diagram.block"');
    expect(normalized).not.toContain("/sch");

    await editor.destroy();
  });
});
