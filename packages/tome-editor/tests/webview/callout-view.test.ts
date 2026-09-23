import { describe, expect, test } from "bun:test";
import { defaultValueCtx, Editor, rootCtx } from "@milkdown/core";
import { editorViewCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { gfm } from "@milkdown/preset-gfm";
import { TextSelection } from "@milkdown/prose/state";
import { calloutPlugin } from "../../src/webview/callout-schema";
import { calloutViewPlugin, CALLOUT_EMOJI_PALETTE } from "../../src/webview/callout-view";

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
    .use(calloutPlugin)
    .use(calloutViewPlugin)
    .create();
  return { editor, root };
}

describe("callout emoji picker", () => {
  test("clicking the icon opens a picker and updates attrs.emoji", async () => {
    const { editor, root } = await createEditor("> 💡 Hello");

    await editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2)));
    });

    const icon = root.querySelector(".tome-callout-icon") as HTMLButtonElement | null;
    expect(icon).toBeTruthy();
    icon!.click();

    const picker = document.querySelector(".tome-callout-emoji-picker");
    expect(picker).toBeTruthy();
    expect(picker?.querySelectorAll(".tome-callout-emoji-picker-item").length).toBe(
      CALLOUT_EMOJI_PALETTE.length,
    );

    const warning = Array.from(picker!.querySelectorAll("button")).find((btn) => btn.textContent === "⚠️");
    expect(warning).toBeTruthy();
    warning!.click();

    expect(document.querySelector(".tome-callout-emoji-picker")).toBeNull();

    await editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      let emoji = "";
      view.state.doc.descendants((node) => {
        if (node.type.name === "callout") emoji = String(node.attrs.emoji);
      });
      expect(emoji).toBe("⚠️");
    });

    expect(root.querySelector(".tome-callout-icon")?.textContent).toBe("⚠️");
    expect(root.querySelector("blockquote.tome-callout")?.getAttribute("data-emoji")).toBe("⚠️");

    await editor.destroy();
  });
});
