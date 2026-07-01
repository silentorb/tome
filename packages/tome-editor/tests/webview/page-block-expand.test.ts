import { describe, expect, test, mock } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { defaultValueCtx, Editor, rootCtx } from "@milkdown/core";
import { editorViewCtx } from "@milkdown/kit/core";
import { TextSelection } from "@milkdown/prose/state";
import { commonmark } from "@milkdown/preset-commonmark";
import { gfm } from "@milkdown/preset-gfm";
import { formatPageBlockEmbedComment, serializePageBlock } from "tome-interfaces/page-block";

try {
  GlobalRegistrator.register();
} catch {
  // already registered by another test file
}

const render = mock(async () => ({ svg: "<svg></svg>" }));
const svgPanZoom = mock(() => ({
  destroy: () => {},
  fit: () => {},
  center: () => {},
  resize: () => {},
  zoomIn: () => {},
  zoomOut: () => {},
}));

mock.module("mermaid", () => ({
  default: {
    initialize: () => {},
    render,
  },
}));

mock.module("svg-pan-zoom", () => ({
  default: svgPanZoom,
}));

const { pageBlockEmbed } = await import("../../src/webview/extensions/page-block-embed");
const { expandInsertedPageBlock, insertPageBlock } = await import(
  "../../src/webview/extensions/page-block-menu"
);

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
    .use(pageBlockEmbed)
    .create();
  return { editor, root };
}

describe("expandInsertedPageBlock", () => {
  test("replaces tome-block fence with prepared embed HTML", async () => {
    const component = {
      id: "schema-diagram.block",
      extensionId: "schema-diagram",
      implementationId: "schema-diagram",
      label: "Schema diagram",
      insertDefaultData: () => ({}),
    };
    const fence = serializePageBlock(component.id, {});
    const embed =
      `${formatPageBlockEmbedComment({ componentId: component.id, data: {} })}\n` +
      '<figure class="tome-schema-diagram"><pre class="mermaid">erDiagram</pre></figure>';

    const { editor, root } = await createEditor();

    await editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const tr = view.state.tr.insertText("/sch", 1);
      const end = 1 + "/sch".length;
      view.dispatch(tr.setSelection(TextSelection.create(tr.doc, end)));
    });

    await editor.action((ctx) => {
      insertPageBlock(ctx, component);
    });

    await editor.action(async (ctx) => {
      await expandInsertedPageBlock(ctx, component, {
        prepareEditorBody: async () => embed,
      });
    });

    await new Promise((resolve) => window.setTimeout(resolve, 150));

    expect(root.querySelector(".tome-schema-diagram-viewport .mermaid-svg-host svg")).toBeTruthy();
    expect(root.textContent).not.toContain("/sch");
    expect(render).toHaveBeenCalled();

    await editor.destroy();
  });
});
