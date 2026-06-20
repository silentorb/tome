import { describe, expect, test } from "bun:test";
import { defaultValueCtx, Editor, rootCtx } from "@milkdown/core";
import { editorViewCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { installCalloutDecoration } from "../../src/webview/callout-decoration";

describe("callout decoration plugin", () => {
  test("applies tome-callout class to emoji-led blockquotes in the editor DOM", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);

    const editor = await Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, "> 💡 Callout body\n\nNext paragraph.");
      })
      .use(commonmark)
      .create();

    await editor.action((ctx) => {
      installCalloutDecoration(ctx.get(editorViewCtx));
    });

    const callout = root.querySelector("blockquote.tome-callout");
    expect(callout).toBeTruthy();
    expect(callout?.textContent).toContain("💡");

    const plain = root.querySelectorAll("blockquote");
    expect(plain.length).toBe(1);

    await editor.destroy();
  });

  test("does not tag plain blockquotes without a leading emoji", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);

    const editor = await Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, "> Plain quotation text.");
      })
      .use(commonmark)
      .create();

    await editor.action((ctx) => {
      installCalloutDecoration(ctx.get(editorViewCtx));
    });

    expect(root.querySelector("blockquote.tome-callout")).toBeNull();
    expect(root.querySelector("blockquote")).toBeTruthy();

    await editor.destroy();
  });
});
