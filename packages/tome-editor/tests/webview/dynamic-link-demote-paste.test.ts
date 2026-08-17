import { describe, expect, test } from "bun:test";
import { defaultValueCtx, Editor, rootCtx } from "@milkdown/core";
import { editorViewCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/preset-commonmark";
import type { EditorView } from "@milkdown/prose/view";
import { editorDynamicNodeHref } from "tome-flatfile/dynamic-node-links";
import { installDynamicLinkDemote } from "../../src/webview/dynamic-node-link-demote";
import { formatEditorDynamicNodeLink } from "../../src/webview/standalone-markdown";

const GOOD_ID = "0000000000000000000000002X";
const EVIL_ID = "0000000000000000000000003Y";
const PARADOX_ID = "0000000000000000000000004Z";

const UNIQUE_SENTENCE = "UNIQUE_PASTE_MARKER every human heart has a basic understanding";

function articleBody(): string {
  const good = formatEditorDynamicNodeLink(GOOD_ID, "Good");
  const evil = formatEditorDynamicNodeLink(EVIL_ID, "Evil");
  const paradox = formatEditorDynamicNodeLink(PARADOX_ID, "Paradox");
  return [
    `Every worldview must address the question of whether ${good} and ${evil} exist, and if so, the following question of how they can coexist?`,
    ``,
    `That is a ${paradox}.`,
    ``,
    `## In every heart`,
    ``,
    `Some worldviews claim that ${good} and/or ${evil} do not exist.`,
    ``,
    `Such claims are surface claims which conflict with the root beliefs held by all.`,
    ``,
    `${UNIQUE_SENTENCE} of ${good} and ${evil} and a belief that they both exist.`,
    ``,
    `It is impossible for a human to comprehensively live his life as though he does not believe in either ${good} or ${evil}.`,
    ``,
    `Anyone who denies the existence of either ${good} or ${evil} will disprove his claimed worldview through his conduct.`,
  ].join("\n");
}

async function setupEditor(body: string): Promise<{ editor: Editor; root: HTMLDivElement }> {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, body);
    })
    .use(commonmark)
    .create();
  return { editor, root };
}

function pasteDocSliceAtEnd(view: EditorView): void {
  const { doc } = view.state;
  const slice = doc.slice(0, doc.content.size);
  view.dispatch(view.state.tr.replace(doc.content.size, doc.content.size, slice));
}

function linkHrefs(view: EditorView): string[] {
  const hrefs: string[] = [];
  view.state.doc.descendants((node) => {
    if (!node.isText) return;
    const href = node.marks.find((mark) => mark.type.name === "link")?.attrs.href;
    if (typeof href === "string") hrefs.push(href);
  });
  return hrefs;
}

describe("dynamic link demotion on paste", () => {
  test("pasting a large link-heavy slice updates the DOM without throwing", async () => {
    const { editor, root } = await setupEditor(articleBody());

    await editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      installDynamicLinkDemote(view);
      expect(root.textContent).toContain(UNIQUE_SENTENCE);
      expect(root.textContent?.split(UNIQUE_SENTENCE).length).toBe(2);

      expect(() => pasteDocSliceAtEnd(view)).not.toThrow();

      expect(root.textContent?.split(UNIQUE_SENTENCE).length).toBe(3);
    });

    await editor.destroy();
  });

  test("pasted dynamic links keep the dynamicTitle marker", async () => {
    const { editor } = await setupEditor(articleBody());

    await editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      installDynamicLinkDemote(view);
      const before = linkHrefs(view);
      expect(before.length).toBeGreaterThan(0);
      expect(before.every((href) => href.includes("dynamicTitle="))).toBe(true);

      pasteDocSliceAtEnd(view);

      const after = linkHrefs(view);
      expect(after.length).toBe(before.length * 2);
      expect(after.every((href) => href.includes("dynamicTitle="))).toBe(true);
      expect(after.some((href) => href === editorDynamicNodeHref(GOOD_ID))).toBe(true);
    });

    await editor.destroy();
  });
});
