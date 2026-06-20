import { describe, expect, test } from "bun:test";
import { defaultValueCtx, Editor, rootCtx } from "@milkdown/core";
import { editorViewCtx } from "@milkdown/kit/core";
import { getMarkdown } from "@milkdown/kit/utils";
import { commonmark } from "@milkdown/preset-commonmark";
import { joinBackward } from "@milkdown/prose/commands";
import { TextSelection } from "@milkdown/prose/state";
import { installListItemDeleteKeymap } from "../../src/webview/list-item-delete-keymap";

async function createEditor(initial: string) {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, initial);
    })
    .use(commonmark)
    .create();
  return { editor, root };
}

function listItemTextStartPos(doc: import("@milkdown/prose/model").Node, text: string): number {
  let pos = -1;
  doc.descendants((node, nodePos) => {
    if (pos >= 0) return false;
    if (node.isText && node.text === text) {
      pos = nodePos;
    }
  });
  if (pos < 0) throw new Error(`text node "${text}" not found`);
  return pos;
}

function dispatchDelete(view: import("@milkdown/prose/view").EditorView): void {
  view.dom.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true }),
  );
}

describe("list item delete keymap", () => {
  test("Delete at bullet start deletes forward instead of lifting the list item", async () => {
    const { editor } = await createEditor("- hello");

    await editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      installListItemDeleteKeymap(view);
      const start = listItemTextStartPos(view.state.doc, "hello");
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, start)));
      dispatchDelete(view);
    });

    await editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      expect(view.state.doc.textContent).toBe("ello");
      const md = getMarkdown()(ctx);
      expect(md).toMatch(/^[*-] ello/m);
    });

    await editor.destroy();
  });

  test("Delete at ordered list start deletes forward instead of lifting the list item", async () => {
    const { editor } = await createEditor("1. alpha");

    await editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      installListItemDeleteKeymap(view);
      const start = listItemTextStartPos(view.state.doc, "alpha");
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, start)));
      dispatchDelete(view);
    });

    await editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      expect(view.state.doc.textContent).toBe("lpha");
      const md = getMarkdown()(ctx);
      expect(md).toMatch(/^1\. lpha/m);
    });

    await editor.destroy();
  });

  test("Backspace at bullet start still lifts via Milkdown's list keymap", async () => {
    const { editor } = await createEditor("- hello");

    await editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      installListItemDeleteKeymap(view);
      const start = listItemTextStartPos(view.state.doc, "hello");
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, start)));
      expect(joinBackward(view.state, view.dispatch, view)).toBe(true);
    });

    await editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      expect(view.state.doc.textContent).toBe("hello");
      const md = getMarkdown()(ctx);
      expect(md).not.toMatch(/^- /m);
    });

    await editor.destroy();
  });
});
