import { describe, expect, test } from "bun:test";
import { defaultValueCtx, Editor, rootCtx } from "@milkdown/core";
import { commandsCtx, editorViewCtx } from "@milkdown/kit/core";
import { getMarkdown } from "@milkdown/kit/utils";
import { commonmark, wrapInHeadingCommand } from "@milkdown/preset-commonmark";
import { TextSelection } from "@milkdown/prose/state";
import {
  installHeadingKeymap,
  isHeadingLevelShortcut,
} from "../../src/webview/heading-keymap";

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

function paragraphTextStartPos(doc: import("@milkdown/prose/model").Node, text: string): number {
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

function dispatchModDigit(
  view: import("@milkdown/prose/view").EditorView,
  digit: string,
  options: { shiftKey?: boolean } = {},
): void {
  view.dom.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: digit,
      code: `Digit${digit}`,
      ctrlKey: true,
      shiftKey: options.shiftKey ?? false,
      bubbles: true,
      cancelable: true,
    }),
  );
}

describe("heading keymap", () => {
  test("isHeadingLevelShortcut accepts Mod+1-6 without shift or alt", () => {
    expect(
      isHeadingLevelShortcut(
        new KeyboardEvent("keydown", { key: "2", ctrlKey: true, shiftKey: false, altKey: false }),
      ),
    ).toBe(2);
    expect(
      isHeadingLevelShortcut(
        new KeyboardEvent("keydown", { key: "6", metaKey: true, shiftKey: false, altKey: false }),
      ),
    ).toBe(6);
  });

  test("isHeadingLevelShortcut rejects shift or alt modifiers", () => {
    expect(
      isHeadingLevelShortcut(
        new KeyboardEvent("keydown", { key: "2", ctrlKey: true, shiftKey: true, altKey: false }),
      ),
    ).toBeNull();
    expect(
      isHeadingLevelShortcut(
        new KeyboardEvent("keydown", { key: "2", ctrlKey: true, shiftKey: false, altKey: true }),
      ),
    ).toBeNull();
  });

  test("Mod+2 turns the current block into heading level 2", async () => {
    const { editor } = await createEditor("hello");

    await editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const start = paragraphTextStartPos(view.state.doc, "hello");
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, start)));
      installHeadingKeymap(view, (level) => {
        ctx.get(commandsCtx).call(wrapInHeadingCommand.key, level);
      });
      dispatchModDigit(view, "2");
    });

    await editor.action((ctx) => {
      const md = getMarkdown()(ctx);
      expect(md).toMatch(/^## hello/m);
    });

    await editor.destroy();
  });

  test("Mod+Shift+2 does not turn the block into a heading", async () => {
    const { editor } = await createEditor("hello");

    await editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const start = paragraphTextStartPos(view.state.doc, "hello");
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, start)));
      installHeadingKeymap(view, (level) => {
        ctx.get(commandsCtx).call(wrapInHeadingCommand.key, level);
      });
      dispatchModDigit(view, "2", { shiftKey: true });
    });

    await editor.action((ctx) => {
      const md = getMarkdown()(ctx);
      expect(md.trim()).toBe("hello");
    });

    await editor.destroy();
  });
});
