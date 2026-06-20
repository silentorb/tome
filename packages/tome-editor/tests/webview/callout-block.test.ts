import { describe, expect, test } from "bun:test";
import { defaultValueCtx, Editor, rootCtx } from "@milkdown/core";
import { editorViewCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { gfm } from "@milkdown/preset-gfm";
import { getMarkdown } from "@milkdown/kit/utils";
import { TextSelection } from "@milkdown/prose/state";
import { DEFAULT_CALLOUT_PREFIX, hasLeadingCalloutEmoji } from "tome-db/callout";
import { insertCalloutBlock } from "../../src/webview/callout-block";
import { installCalloutDecoration } from "../../src/webview/callout-decoration";

function countBlockquotes(doc: { descendants: (f: (node: { type: { name: string } }) => void) => void }): number {
  let count = 0;
  doc.descendants((node) => {
    if (node.type.name === "blockquote") count += 1;
  });
  return count;
}

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
    .create();
  return { editor, root };
}

function selectAtParagraphEnd(
  view: { state: { doc: { resolve: (pos: number) => { end: () => number }; descendants: (f: (node: { isText?: boolean; text?: string | null }, pos: number) => void) => void } } },
  needle: string,
): number {
  let cursorPos = 1;
  view.state.doc.descendants((node, pos) => {
    if (node.isText && node.text?.includes(needle)) {
      cursorPos = view.state.doc.resolve(pos).end();
    }
  });
  return cursorPos;
}

describe("callout block insertion", () => {
  test("insertCalloutBlock creates blockquote with default emoji prefix", async () => {
    const { editor, root } = await createEditor("Hello");

    await editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));
      insertCalloutBlock(ctx);
    });

    const blockquote = root.querySelector("blockquote");
    expect(blockquote).toBeTruthy();
    const text = blockquote?.textContent ?? "";
    expect(hasLeadingCalloutEmoji(text)).toBe(true);
    expect(text.startsWith(DEFAULT_CALLOUT_PREFIX.trim())).toBe(true);

    await editor.destroy();
  });

  test("nested markdown loads with two decorated callouts", async () => {
    const nested = `> 💡 Outer callout
> > 💡 Inner callout
> >
> > Second inner paragraph`;
    const { editor, root } = await createEditor(nested);

    await editor.action((ctx) => {
      installCalloutDecoration(ctx.get(editorViewCtx));
    });

    expect(root.querySelectorAll("blockquote.tome-callout").length).toBe(2);
    await editor.action((ctx) => {
      expect(countBlockquotes(ctx.get(editorViewCtx).state.doc)).toBe(2);
    });

    await editor.destroy();
  });

  test("insertCalloutBlock on empty line inside outer callout nests without double emoji", async () => {
    const { editor, root } = await createEditor("> 💡 Outer");

    await editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      installCalloutDecoration(view);
      const endPos = view.state.doc.resolve(2).end();
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, endPos)));
      view.dispatch(view.state.tr.split(endPos));
      insertCalloutBlock(ctx);
    });

    expect(root.querySelectorAll("blockquote.tome-callout").length).toBe(2);
    await editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      expect(countBlockquotes(view.state.doc)).toBe(2);
      const md = getMarkdown()(ctx);
      expect(md).toContain("> >");
      expect(md).toContain("💡");
      expect(md).not.toContain("💡💡");
      expect(md).toContain("Outer");
    });

    await editor.destroy();
  });

  test("insertCalloutBlock at end of outer callout preserves outer text", async () => {
    const { editor } = await createEditor("> 💡 Outer text");

    await editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      installCalloutDecoration(view);
      const cursorPos = selectAtParagraphEnd(view, "Outer text");
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, cursorPos)));
      insertCalloutBlock(ctx);
    });

    await editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      expect(countBlockquotes(view.state.doc)).toBe(2);
      const md = getMarkdown()(ctx);
      expect(md).toContain("Outer text");
      expect(md).toContain("> >");
    });

    await editor.destroy();
  });
});
