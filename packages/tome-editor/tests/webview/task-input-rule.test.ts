import { describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { defaultValueCtx, Editor, rootCtx } from "@milkdown/core";
import { editorViewCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { TextSelection } from "@milkdown/prose/state";
import { insertTaskBlock, installTaskInputRule } from "../../src/webview/task-input-rule";
import { taskPlugin } from "../../src/webview/task-schema";
import { taskViewPlugin } from "../../src/webview/task-view";

try {
  GlobalRegistrator.register();
} catch {
  // already registered by another test file
}

function countTasks(doc: {
  descendants: (f: (node: { type: { name: string }; attrs: Record<string, unknown> }) => void) => void;
}): number {
  let count = 0;
  doc.descendants((node) => {
    if (node.type.name === "task") count += 1;
  });
  return count;
}

async function createEditor(initial = "") {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, initial);
    })
    .use(commonmark)
    .use(taskPlugin)
    .use(taskViewPlugin);
  installTaskInputRule(editor);
  await editor.create();
  return { editor, root };
}

describe("task input rule", () => {
  test("typing [] at paragraph start wraps in a task block", async () => {
    const { editor } = await createEditor("");
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const start = 1;
      view.dispatch(view.state.tr.insertText("[", start));
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(view.state.doc, start + 1)),
      );
      view.someProp("handleTextInput", (f) =>
        f(view, start + 1, start + 1, "]", () => view.state.tr),
      );
    });

    await editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      expect(countTasks(view.state.doc)).toBe(1);
      let checked: unknown;
      view.state.doc.descendants((node) => {
        if (node.type.name === "task") checked = node.attrs.checked;
      });
      expect(checked).toBe(false);
    });

    await editor.destroy();
  });

  test("insertTaskBlock wraps the current block without Crepe", async () => {
    const { editor } = await createEditor("Hello");
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      expect(insertTaskBlock(view)).toBe(true);
      expect(countTasks(view.state.doc)).toBe(1);
    });
    await editor.destroy();
  });
});
