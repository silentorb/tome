import { describe, expect, test } from "bun:test";
import { defaultValueCtx, Editor, rootCtx } from "@milkdown/core";
import { editorViewCtx } from "@milkdown/kit/core";
import { getMarkdown } from "@milkdown/kit/utils";
import { commonmark } from "@milkdown/preset-commonmark";
import { NodeSelection } from "@milkdown/prose/state";
import {
  deleteActiveEditorBlock,
  installBlockHandleMenu,
} from "../../src/webview/block-handle-menu";

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

function topLevelBlockPos(doc: import("@milkdown/prose/model").Node, index: number): number {
  let pos = 0;
  for (let i = 0; i < index; i++) {
    pos += doc.child(i).nodeSize;
  }
  return pos;
}

describe("block handle menu", () => {
  test("deleteActiveEditorBlock removes a node-selected top-level block", async () => {
    const { editor } = await createEditor("First\n\nSecond");

    await editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const secondPos = topLevelBlockPos(view.state.doc, 1);
      view.dispatch(
        view.state.tr.setSelection(NodeSelection.create(view.state.doc, secondPos)),
      );
      expect(deleteActiveEditorBlock(view)).toBe(true);
    });

    await editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      expect(view.state.doc.childCount).toBe(1);
      expect(view.state.doc.textContent).toBe("First");
      const md = getMarkdown()(ctx);
      expect(md.trim()).toBe("First");
    });

    await editor.destroy();
  });

  test("installBlockHandleMenu opens Delete and removes the active block", async () => {
    const { editor, root } = await createEditor("Keep\n\nRemove me");

    const shell = document.createElement("div");
    shell.appendChild(root);
    document.body.appendChild(shell);

    const blockHandle = document.createElement("div");
    blockHandle.className = "milkdown-block-handle";
    blockHandle.innerHTML = `
      <div class="operation-item"></div>
      <div class="operation-item"></div>
    `;
    shell.appendChild(blockHandle);

    let detachMenu: (() => void) | undefined;

    await editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const secondPos = topLevelBlockPos(view.state.doc, 1);
      view.dispatch(
        view.state.tr.setSelection(NodeSelection.create(view.state.doc, secondPos)),
      );
      detachMenu = installBlockHandleMenu(view, shell);
    });

    const dragHandle = blockHandle.querySelector(".operation-item:last-child") as HTMLElement;
    dragHandle.dispatchEvent(
      new PointerEvent("pointerdown", { clientX: 10, clientY: 10, bubbles: true }),
    );
    dragHandle.dispatchEvent(
      new PointerEvent("pointerup", { clientX: 10, clientY: 10, bubbles: true }),
    );

    const menu = document.querySelector(".tome-block-handle-menu");
    expect(menu).not.toBeNull();

    const deleteButton = menu?.querySelector("button");
    expect(deleteButton?.textContent).toBe("Delete");
    deleteButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    await editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      expect(view.state.doc.textContent).toBe("Keep");
      const md = getMarkdown()(ctx);
      expect(md.trim()).toBe("Keep");
    });

    detachMenu?.();
    shell.remove();
    await editor.destroy();
  });
});
