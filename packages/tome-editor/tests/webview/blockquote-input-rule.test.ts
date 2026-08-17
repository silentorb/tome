import { describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { defaultValueCtx, Editor, rootCtx } from "@milkdown/core";
import { editorViewCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { getMarkdown } from "@milkdown/kit/utils";
import { TextSelection } from "@milkdown/prose/state";
import { replaceBlockquoteInputRule } from "../../src/webview/blockquote-input-rule";

try {
  GlobalRegistrator.register();
} catch {
  // already registered by another test file
}

function countBlockquotes(doc: {
  descendants: (f: (node: { type: { name: string } }) => void) => void;
}): number {
  let count = 0;
  doc.descendants((node) => {
    if (node.type.name === "blockquote") count += 1;
  });
  return count;
}

async function createEditor(initial: string, applyFix: boolean) {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, initial);
    })
    .use(commonmark);
  if (applyFix) {
    await replaceBlockquoteInputRule(editor);
  }
  await editor.create();
  return { editor, root };
}

function typeBlockquoteMarkerAfterQuote(editor: Editor): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    let textFrom = -1;
    let textTo = -1;
    view.state.doc.forEach((node, offset) => {
      if (node.type.name === "paragraph" && node.textContent === "q") {
        textFrom = offset + 1;
        textTo = offset + 2;
      }
    });
    view.dispatch(view.state.tr.insertText(">", textFrom, textTo));
    const afterInsert = ctx.get(editorViewCtx);
    const caret = textFrom + 1;
    afterInsert.dispatch(
      afterInsert.state.tr.setSelection(TextSelection.create(afterInsert.state.doc, caret)),
    );
    afterInsert.someProp("handleTextInput", (f) =>
      f(afterInsert, caret, caret, " ", () => afterInsert.state.tr),
    );
  });
}

describe("blockquote input rule", () => {
  test("stock wrapInBlockquoteInputRule joins a new quote into the previous one", async () => {
    const { editor } = await createEditor("> A\n\nq", false);
    typeBlockquoteMarkerAfterQuote(editor);

    await editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      expect(countBlockquotes(view.state.doc)).toBe(1);
    });

    await editor.destroy();
  });

  test("replaceBlockquoteInputRule keeps neighboring quotes as distinct blocks", async () => {
    const { editor } = await createEditor("> A\n\nq", true);
    typeBlockquoteMarkerAfterQuote(editor);

    await editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      expect(countBlockquotes(view.state.doc)).toBe(2);
      const md = getMarkdown()(ctx);
      expect(md).toContain("> A\n\n>");
    });

    await editor.destroy();
  });
});
