import { describe, expect, test } from "bun:test";
import { defaultValueCtx, Editor, rootCtx } from "@milkdown/core";
import { editorViewCtx } from "@milkdown/kit/core";
import { replaceRange } from "@milkdown/kit/utils";
import { commonmark } from "@milkdown/preset-commonmark";
import { TextSelection } from "@milkdown/prose/state";
import {
  activeMentionRangeAtSelection,
  isMentionFragment,
  resolveMentionInsertRange,
} from "../../src/webview/mention-range";
import { formatNodeMarkdownLink, nodeMarkdownHref } from "../../src/shared/types";

const TARGET_ID = "e5cc80dc61ed4c629951cdf472b20b7a";

describe("isMentionFragment", () => {
  test("accepts @ with empty query", () => {
    expect(isMentionFragment("@")).toBe(true);
  });

  test("accepts @ with partial query", () => {
    expect(isMentionFragment("@Cozy")).toBe(true);
  });

  test("accepts query containing whitespace", () => {
    expect(isMentionFragment("@Cozy hor")).toBe(true);
    expect(isMentionFragment("@Cozy horror")).toBe(true);
  });

  test("rejects invalid mention characters", () => {
    expect(isMentionFragment("@Cozy!")).toBe(false);
  });
});

describe("resolveMentionInsertRange", () => {
  test("extends stale stored end through cursor", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const editor = await Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, "See @Coz");
      })
      .use(commonmark)
      .create();

    let stored = { replaceFrom: 0, replaceTo: 0 };
    await editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      let cursor = -1;
      view.state.doc.descendants((node, pos) => {
        if (cursor >= 0 || !node.isText || !node.text?.includes("@Coz")) return;
        const idx = node.text.indexOf("@Coz");
        cursor = pos + idx + "@Coz".length;
      });
      expect(cursor).toBeGreaterThan(0);
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(view.state.doc, cursor)),
      );
      const live = activeMentionRangeAtSelection(view.state);
      expect(live).not.toBeNull();
      stored = {
        replaceFrom: live!.replaceFrom,
        replaceTo: live!.replaceTo - 1,
      };
      const resolved = resolveMentionInsertRange(view.state, stored);
      expect(resolved?.replaceTo).toBe(cursor);
      const link = formatNodeMarkdownLink("Cozy horror", TARGET_ID);
      replaceRange(link, {
        from: resolved!.replaceFrom,
        to: resolved!.replaceTo,
      })(ctx);
    });

    expect(root.textContent).not.toContain("@Cozy");
    expect(root.textContent).not.toMatch(/\]r/);
    expect(root.querySelector(`a[href="${nodeMarkdownHref(TARGET_ID)}"]`)).toBeTruthy();
    await editor.destroy();
  });
});
