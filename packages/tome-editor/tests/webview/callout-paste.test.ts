import { describe, expect, test } from "bun:test";
import { defaultValueCtx, Editor, rootCtx } from "@milkdown/core";
import { editorViewCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { gfm } from "@milkdown/preset-gfm";
import { getMarkdown } from "@milkdown/kit/utils";
import { TextSelection } from "@milkdown/prose/state";
import { DOMParser as PMDOMParser } from "@milkdown/prose/model";
import { installCalloutDecoration } from "../../src/webview/callout-decoration";
import { installCalloutPaste } from "../../src/webview/callout-paste";
import { transformPastedCalloutSlice } from "../../src/webview/callout-paste";

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

function countBlockquotes(doc: { descendants: (f: (node: { type: { name: string } }) => void) => void }): number {
  let count = 0;
  doc.descendants((node) => {
    if (node.type.name === "blockquote") count += 1;
  });
  return count;
}

describe("callout paste", () => {
  test("paste callout HTML into outer callout preserves nested blockquote", async () => {
    const { editor, root } = await createEditor("> 💡 Outer\n> ");

    await editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      installCalloutDecoration(view);
      installCalloutPaste(view);

      let cursorPos = 1;
      view.state.doc.descendants((node, pos) => {
        if (node.type.name === "paragraph" && node.textContent === "") {
          cursorPos = pos + 1;
        }
      });
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, cursorPos)));

      const template = document.createElement("div");
      template.innerHTML = "<blockquote><p>💡 Pasted inner</p></blockquote>";
      const parser = PMDOMParser.fromSchema(view.state.schema);
      let slice = parser.parseSlice(template, {
        context: view.state.selection.$from,
        preserveWhitespace: true,
      });
      slice = transformPastedCalloutSlice(slice, view);

      view.dispatch(view.state.tr.replaceSelection(slice));
    });

    expect(root.querySelectorAll("blockquote.tome-callout").length).toBe(2);
    await editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      expect(countBlockquotes(view.state.doc)).toBe(2);
      const md = getMarkdown()(ctx);
      expect(md).toContain("> >");
      expect(md).toContain("Pasted inner");
    });

    await editor.destroy();
  });

  test("paste callout into non-callout context is unchanged", async () => {
    const { editor } = await createEditor("Hello");

    await editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      installCalloutPaste(view);
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 6)));

      const template = document.createElement("div");
      template.innerHTML = "<blockquote><p>💡 Pasted</p></blockquote>";
      const parser = PMDOMParser.fromSchema(view.state.schema);
      let slice = parser.parseSlice(template, {
        context: view.state.selection.$from,
        preserveWhitespace: true,
      });
      const before = slice.openStart;
      slice = transformPastedCalloutSlice(slice, view);
      expect(slice.openStart).toBe(before);
    });

    await editor.destroy();
  });

  test("paste plain blockquote into callout is not forced to nest", async () => {
    const { editor } = await createEditor("> 💡 Outer\n> ");

    await editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      installCalloutPaste(view);

      let cursorPos = 1;
      view.state.doc.descendants((node, pos) => {
        if (node.type.name === "paragraph" && node.textContent === "") {
          cursorPos = pos + 1;
        }
      });
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, cursorPos)));

      const template = document.createElement("div");
      template.innerHTML = "<blockquote><p>Plain quote text</p></blockquote>";
      const parser = PMDOMParser.fromSchema(view.state.schema);
      let slice = parser.parseSlice(template, {
        context: view.state.selection.$from,
        preserveWhitespace: true,
      });
      slice = transformPastedCalloutSlice(slice, view);
      expect(slice.openStart).not.toBe(0);
    });

    await editor.destroy();
  });
});
