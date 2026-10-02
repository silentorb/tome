import { describe, expect, test } from "bun:test";
import { defaultValueCtx, Editor, rootCtx } from "@milkdown/core";
import { editorViewCtx } from "@milkdown/kit/core";
import { getMarkdown } from "@milkdown/kit/utils";
import { commonmark } from "@milkdown/preset-commonmark";
import { gfm } from "@milkdown/preset-gfm";
import { NodeSelection } from "@milkdown/prose/state";
import { DEFAULT_CALLOUT_EMOJI } from "tome-flatfile/callout";
import {
  deleteActiveEditorBlock,
  installBlockHandleMenu,
} from "../../src/webview/block-handle-menu";
import { calloutPlugin } from "../../src/webview/callout-schema";
import { calloutViewPlugin } from "../../src/webview/callout-view";
import {
  unwrapActiveCallout,
  wrapActiveBlockInCallout,
} from "../../src/webview/callout-wrap";

async function createEditor(initial: string, withCallout = false) {
  const root = document.createElement("div");
  document.body.appendChild(root);
  let builder = Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, initial);
    })
    .use(commonmark);
  if (withCallout) {
    builder = builder.use(gfm).use(calloutPlugin).use(calloutViewPlugin);
  }
  const editor = await builder.create();
  return { editor, root };
}

function topLevelBlockPos(doc: import("@milkdown/prose/model").Node, index: number): number {
  let pos = 0;
  for (let i = 0; i < index; i++) {
    pos += doc.child(i).nodeSize;
  }
  return pos;
}

function menuLabels(): string[] {
  return [...document.querySelectorAll(".tome-block-handle-menu button")].map(
    (el) => el.textContent ?? "",
  );
}

async function mountHandleMenu(initial: string, options?: { withCallout?: boolean; blockIndex?: number }) {
  const { editor, root } = await createEditor(initial, options?.withCallout ?? false);

  const shell = document.createElement("div");
  shell.appendChild(root);
  document.body.appendChild(shell);

  const blockHandle = document.createElement("div");
  blockHandle.className = "milkdown-block-handle";
  blockHandle.draggable = true;
  // Crepe renders the grip icon as SVG; real clicks target path/svg, not the div.
  blockHandle.innerHTML = `
    <div class="operation-item"><svg><path d="M0 0" /></svg></div>
    <div class="operation-item"><svg><path d="M0 0" /></svg></div>
  `;
  shell.appendChild(blockHandle);

  let detachMenu: (() => void) | undefined;
  const blockIndex = options?.blockIndex ?? 1;

  await editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const pos = topLevelBlockPos(view.state.doc, blockIndex);
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
    detachMenu = installBlockHandleMenu(view, shell);
  });

  const dragHandle = blockHandle.querySelector(".operation-item:last-child") as HTMLElement;
  const gripIcon = dragHandle.querySelector("path") as Element;

  return { editor, shell, blockHandle, dragHandle, gripIcon, detachMenu };
}

function openGripMenu(gripIcon: Element) {
  gripIcon.dispatchEvent(
    new PointerEvent("pointerdown", { clientX: 10, clientY: 10, bubbles: true }),
  );
  gripIcon.dispatchEvent(
    new PointerEvent("pointerup", { clientX: 10, clientY: 10, bubbles: true }),
  );
  return document.querySelector(".tome-block-handle-menu");
}

describe("block handle menu", async () => {
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

  test("installBlockHandleMenu opens Wrap then Delete and removes the active block", async () => {
    const { editor, shell, gripIcon, detachMenu } = await mountHandleMenu(
      "Keep\n\nRemove me",
    );

    const menu = openGripMenu(gripIcon);
    expect(menu).not.toBeNull();
    expect(menuLabels()).toEqual(["Wrap in Callout", "Delete"]);

    const deleteButton = [...menu!.querySelectorAll("button")].find(
      (b) => b.textContent === "Delete",
    );
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

  test("opens menu when the click target is the grip SVG path", async () => {
    const { editor, shell, gripIcon, detachMenu } = await mountHandleMenu(
      "Keep\n\nRemove me",
    );

    expect(gripIcon instanceof HTMLElement).toBe(false);
    expect(gripIcon instanceof Element).toBe(true);

    gripIcon.dispatchEvent(
      new PointerEvent("pointerdown", { clientX: 20, clientY: 20, bubbles: true }),
    );
    document.body.dispatchEvent(
      new PointerEvent("pointerup", { clientX: 20, clientY: 20, bubbles: true }),
    );

    expect(document.querySelector(".tome-block-handle-menu")).not.toBeNull();
    expect(menuLabels()).toEqual(["Wrap in Callout", "Delete"]);

    detachMenu?.();
    shell.remove();
    await editor.destroy();
  });

  test("opens menu when pointerup is retargeted away from the grip", async () => {
    const { editor, shell, gripIcon, detachMenu } = await mountHandleMenu(
      "Keep\n\nRemove me",
    );

    gripIcon.dispatchEvent(
      new PointerEvent("pointerdown", { clientX: 10, clientY: 10, bubbles: true }),
    );
    // Native drag / focus can retarget the up event off the grip.
    document.body.dispatchEvent(
      new PointerEvent("pointerup", { clientX: 10, clientY: 10, bubbles: true }),
    );

    const menu = document.querySelector(".tome-block-handle-menu");
    expect(menu).not.toBeNull();

    const deleteButton = [...menu!.querySelectorAll("button")].find(
      (b) => b.textContent === "Delete",
    );
    deleteButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    await editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      expect(view.state.doc.textContent).toBe("Keep");
    });

    detachMenu?.();
    shell.remove();
    await editor.destroy();
  });

  test("does not open the menu after dragstart on the block handle", async () => {
    const { editor, shell, blockHandle, gripIcon, detachMenu } =
      await mountHandleMenu("Keep\n\nRemove me");

    gripIcon.dispatchEvent(
      new PointerEvent("pointerdown", { clientX: 10, clientY: 10, bubbles: true }),
    );
    blockHandle.dispatchEvent(new DragEvent("dragstart", { bubbles: true }));
    document.body.dispatchEvent(
      new PointerEvent("pointerup", { clientX: 12, clientY: 12, bubbles: true }),
    );

    expect(document.querySelector(".tome-block-handle-menu")).toBeNull();

    detachMenu?.();
    shell.remove();
    await editor.destroy();
  });

  test("wrapActiveBlockInCallout wraps a paragraph preserving content", async () => {
    const { editor } = await createEditor("Hello world", true);

    await editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const pos = topLevelBlockPos(view.state.doc, 0);
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
      expect(wrapActiveBlockInCallout(view)).toBe(true);
    });

    await editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      let found = false;
      view.state.doc.descendants((node) => {
        if (node.type.name === "callout") {
          found = true;
          expect(node.attrs.emoji).toBe(DEFAULT_CALLOUT_EMOJI);
          expect(node.textContent).toBe("Hello world");
        }
      });
      expect(found).toBe(true);
      const md = getMarkdown()(ctx);
      expect(md).toContain(`> ${DEFAULT_CALLOUT_EMOJI}`);
      expect(md).toContain("Hello world");
    });

    await editor.destroy();
  });

  test("unwrapActiveCallout lifts callout children", async () => {
    const { editor } = await createEditor(`> ${DEFAULT_CALLOUT_EMOJI} Note text`, true);

    await editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const pos = topLevelBlockPos(view.state.doc, 0);
      expect(view.state.doc.child(0).type.name).toBe("callout");
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
      expect(unwrapActiveCallout(view)).toBe(true);
    });

    await editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      expect(view.state.doc.child(0).type.name).not.toBe("callout");
      expect(view.state.doc.textContent).toContain("Note text");
      const md = getMarkdown()(ctx);
      expect(md).not.toContain(`> ${DEFAULT_CALLOUT_EMOJI}`);
      expect(md).toContain("Note text");
    });

    await editor.destroy();
  });

  test("menu shows Wrap in Callout on a paragraph and wraps on click", async () => {
    const { editor, shell, gripIcon, detachMenu } = await mountHandleMenu("Body text", {
      withCallout: true,
      blockIndex: 0,
    });

    const menu = openGripMenu(gripIcon);
    expect(menuLabels()).toEqual(["Wrap in Callout", "Delete"]);

    const wrapButton = [...menu!.querySelectorAll("button")].find(
      (b) => b.textContent === "Wrap in Callout",
    );
    wrapButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    await editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      expect(view.state.doc.child(0).type.name).toBe("callout");
      expect(view.state.doc.textContent).toBe("Body text");
      const md = getMarkdown()(ctx);
      expect(md).toContain(`> ${DEFAULT_CALLOUT_EMOJI}`);
    });

    detachMenu?.();
    shell.remove();
    await editor.destroy();
  });

  test("menu shows Unwrap Callout on a callout and unwraps on click", async () => {
    const { editor, shell, gripIcon, detachMenu } = await mountHandleMenu(
      `> ${DEFAULT_CALLOUT_EMOJI} Callout body`,
      { withCallout: true, blockIndex: 0 },
    );

    const menu = openGripMenu(gripIcon);
    expect(menuLabels()).toEqual(["Unwrap Callout", "Delete"]);

    const unwrapButton = [...menu!.querySelectorAll("button")].find(
      (b) => b.textContent === "Unwrap Callout",
    );
    unwrapButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    await editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      expect(view.state.doc.child(0).type.name).not.toBe("callout");
      expect(view.state.doc.textContent).toContain("Callout body");
    });

    detachMenu?.();
    shell.remove();
    await editor.destroy();
  });
});
