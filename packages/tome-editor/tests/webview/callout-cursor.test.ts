import { describe, expect, test } from "bun:test";
import { defaultValueCtx, Editor, rootCtx } from "@milkdown/core";
import { editorViewCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { TextSelection } from "@milkdown/prose/state";
import { installCalloutCursor } from "../../src/webview/callout-cursor";
import { installCalloutDecoration } from "../../src/webview/callout-decoration";

describe("callout cursor", () => {
  test("enables native caret styling while editing inside a callout", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);

    const editor = await Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, "> 💡 Note text");
      })
      .use(commonmark)
      .create();

    await editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      installCalloutDecoration(view);
      installCalloutCursor(view);
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 4)));
      view.focus();
    });

    const prose = root.querySelector(".ProseMirror");
    expect(prose?.classList.contains("tome-callout-editing")).toBe(true);

    await editor.destroy();
  });

  test("enables native caret styling inside nested inner callout", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);

    const editor = await Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, "> 💡 Outer\n> > 💡 Inner text");
      })
      .use(commonmark)
      .create();

    await editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      installCalloutDecoration(view);
      installCalloutCursor(view);
      let innerPos = 1;
      view.state.doc.descendants((node, pos) => {
        if (node.isText && node.text?.includes("Inner text")) {
          innerPos = pos + 3;
        }
      });
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, innerPos)));
      view.focus();
    });

    const prose = root.querySelector(".ProseMirror");
    expect(prose?.classList.contains("tome-callout-editing")).toBe(true);

    await editor.destroy();
  });
});
