import { describe, expect, test } from "bun:test";
import { defaultValueCtx, Editor, rootCtx } from "@milkdown/core";
import { editorViewCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { TextSelection } from "@milkdown/prose/state";
import {
  activeMentionRangeAtSelection,
  type ActiveMentionRange,
} from "../../src/webview/mention-range";

async function mentionRangeFor(
  body: string,
  mention: string,
): Promise<ActiveMentionRange | null> {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, body);
    })
    .use(commonmark)
    .create();

  let range: ActiveMentionRange | null = null;
  await editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    let cursor = -1;
    view.state.doc.descendants((node, pos) => {
      if (cursor >= 0 || !node.isText || !node.text?.includes(mention)) return;
      const idx = node.text.indexOf(mention);
      cursor = pos + idx + mention.length;
    });
    expect(cursor).toBeGreaterThan(0);
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, cursor)),
    );
    range = activeMentionRangeAtSelection(view.state);
  });
  await editor.destroy();
  return range;
}

describe("activeMentionRangeAtSelection", () => {
  test("covers @ and full query at paragraph start", async () => {
    const range = await mentionRangeFor("@cozy", "@cozy");
    expect(range).not.toBeNull();
    expect(range!.query).toBe("cozy");
    expect(range!.replaceFrom).toBe(1);
    expect(range!.replaceTo).toBe(6);
  });

  test("starts replace range at @, preserving leading space", async () => {
    const range = await mentionRangeFor("See @co here", "@co");
    expect(range).not.toBeNull();
    expect(range!.query).toBe("co");
    expect(range!.replaceFrom).toBe(5);
    expect(range!.replaceTo).toBe(8);
  });

  test("detects mention immediately after lone @", async () => {
    const range = await mentionRangeFor("See @ here", "@");
    expect(range).not.toBeNull();
    expect(range!.query).toBe("");
    expect(range!.replaceTo).toBeGreaterThan(range!.replaceFrom);
  });

  test("includes spaces in multi-word query", async () => {
    const range = await mentionRangeFor("See @cozy horror", "@cozy horror");
    expect(range).not.toBeNull();
    expect(range!.query).toBe("cozy horror");
    expect(range!.replaceFrom).toBe(5);
    expect(range!.replaceTo).toBe(17);
  });

  test("detects mention immediately after open parenthesis", async () => {
    const range = await mentionRangeFor("See (@co here", "@co");
    expect(range).not.toBeNull();
    expect(range!.query).toBe("co");
    expect(range!.replaceFrom).toBe(6);
    expect(range!.replaceTo).toBe(9);
  });

  test("does not treat email local-part as a mention trigger", async () => {
    const range = await mentionRangeFor("user@domain here", "@domain");
    expect(range).toBeNull();
  });
});
