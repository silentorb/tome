import { describe, expect, test } from "bun:test";
import { defaultValueCtx, Editor, rootCtx } from "@milkdown/core";
import { editorViewCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { editorDynamicNodeHref } from "tome-flatfile/dynamic-node-links";
import { documentToStorageBody } from "tome-db/document-to-storage-body";
import { convertStaticNodeLinkToDynamic } from "../../src/webview/dynamic-node-link-convert";
import {
  findLinkMarkRange,
  installLinkTooltip,
  type LinkTooltipHandle,
} from "../../src/webview/link-tooltip";
import { pmNodeToDocument } from "../../src/webview/body-document-pm";
import {
  formatEditorDynamicNodeLink,
  formatEditorNodeMarkdownLink,
} from "../../src/webview/standalone-markdown";

const TARGET_ID = "0000000000000000000000002X";

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

function findLinkRange(
  view: { state: { doc: import("@milkdown/prose/model").Node } },
  text: string,
): { from: number; to: number } {
  let from = -1;
  let to = -1;
  view.state.doc.descendants((node, pos) => {
    if (from >= 0 || !node.isText || !node.text?.includes(text)) return;
    const idx = node.text.indexOf(text);
    from = pos + idx;
    to = from + text.length;
  });
  expect(from).toBeGreaterThan(0);
  return { from, to };
}

describe("convertStaticNodeLinkToDynamic", () => {
  test("static node link becomes dynamic_link with resolved title", async () => {
    const staticLink = formatEditorNodeMarkdownLink("Custom label", TARGET_ID);
    const { editor } = await setupEditor(`See ${staticLink} here.`);

    await editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const { from, to } = findLinkRange(view, "Custom label");
      expect(convertStaticNodeLinkToDynamic(view, from, to, "Cozy horror")).toBe(true);

      let href = "";
      let text = "";
      view.state.doc.descendants((node) => {
        if (!node.isText) return;
        const link = node.marks.find((mark) => mark.type.name === "link");
        if (link && node.text?.includes("Cozy")) {
          href = String(link.attrs.href ?? "");
          text = node.text ?? "";
        }
      });
      expect(href).toBe(editorDynamicNodeHref(TARGET_ID));
      expect(text).toBe("Cozy horror");

      const doc = pmNodeToDocument(view.state.doc);
      const para = doc.content.find((b) => b.type === "paragraph");
      expect(para && "content" in para ? para.content : []).toContainEqual({
        type: "dynamic_link",
        nodeId: TARGET_ID,
        title: "Cozy horror",
      });
      expect(documentToStorageBody(doc)).toContain(`[[${TARGET_ID}]]`);
    });

    await editor.destroy();
  });

  test("no-op for dynamic links and non-node hrefs", async () => {
    const { editor } = await setupEditor(
      `See [Already](${editorDynamicNodeHref(TARGET_ID)}) and [ext](https://example.com).`,
    );

    await editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const dynamic = findLinkRange(view, "Already");
      expect(convertStaticNodeLinkToDynamic(view, dynamic.from, dynamic.to, "X")).toBe(false);
      const ext = findLinkRange(view, "ext");
      expect(convertStaticNodeLinkToDynamic(view, ext.from, ext.to, "X")).toBe(false);
    });

    await editor.destroy();
  });
});

describe("link tooltip convert control", () => {
  test("shows Use dynamic title for static node links", async () => {
    const staticLink = formatEditorNodeMarkdownLink("Custom label", TARGET_ID);
    const { editor, root } = await setupEditor(`See ${staticLink} here.`);
    let handle: LinkTooltipHandle | undefined;

    await editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      handle = installLinkTooltip(view, root, {
        resolveTitle: async () => "Cozy horror",
      });
      const { from } = findLinkRange(view, "Custom label");
      const range = findLinkMarkRange(view.state.doc, from);
      expect(range).not.toBeNull();
      handle.showPreview(range!);
    });

    const convert = root.querySelector(".tome-link-tooltip-convert");
    expect(convert).toBeTruthy();
    expect(convert?.getAttribute("aria-label")).toBe("Use dynamic title");

    handle?.dispose();
    await editor.destroy();
  });

  test("does not show convert for dynamic-title links", async () => {
    const dynamicLink = formatEditorDynamicNodeLink(TARGET_ID, "Cozy horror");
    const { editor, root } = await setupEditor(`See ${dynamicLink} here.`);
    let handle: LinkTooltipHandle | undefined;

    await editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      handle = installLinkTooltip(view, root, {
        resolveTitle: async () => "Unused",
      });
      const { from } = findLinkRange(view, "Cozy horror");
      const range = findLinkMarkRange(view.state.doc, from);
      expect(range).not.toBeNull();
      handle.showPreview(range!);
    });

    expect(root.querySelector(".tome-link-tooltip-preview")).toBeTruthy();
    expect(root.querySelector(".tome-link-tooltip-convert")).toBeNull();

    handle?.dispose();
    await editor.destroy();
  });

  test("edit and remove update the link mark", async () => {
    const staticLink = formatEditorNodeMarkdownLink("Label", TARGET_ID);
    const { editor, root } = await setupEditor(staticLink);
    let handle: LinkTooltipHandle | undefined;

    await editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      handle = installLinkTooltip(view, root, { resolveTitle: async () => "T" });
      const { from } = findLinkRange(view, "Label");
      const range = findLinkMarkRange(view.state.doc, from);
      expect(range).not.toBeNull();
      handle.showPreview(range!);
    });

    const editBtn = root.querySelector(".tome-link-tooltip-edit-btn") as HTMLButtonElement | null;
    expect(editBtn).toBeTruthy();
    editBtn!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

    const input = root.querySelector(".tome-link-tooltip-input") as HTMLInputElement | null;
    expect(input).toBeTruthy();
    input!.value = "https://example.com/x";
    const confirm = root.querySelector(".tome-link-tooltip-confirm") as HTMLButtonElement | null;
    expect(confirm).toBeTruthy();
    confirm!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

    await editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      let href = "";
      view.state.doc.descendants((node) => {
        if (!node.isText) return;
        const link = node.marks.find((m) => m.type.name === "link");
        if (link) href = String(link.attrs.href ?? "");
      });
      expect(href).toBe("https://example.com/x");

      const { from } = findLinkRange(view, "Label");
      const range = findLinkMarkRange(view.state.doc, from);
      expect(range).not.toBeNull();
      handle!.showPreview(range!);
    });

    const remove = root.querySelector(".tome-link-tooltip-remove") as HTMLButtonElement | null;
    expect(remove).toBeTruthy();
    remove!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

    await editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      let hasLink = false;
      view.state.doc.descendants((node) => {
        if (!node.isText) return;
        if (node.marks.some((m) => m.type.name === "link")) hasLink = true;
      });
      expect(hasLink).toBe(false);
    });

    handle?.dispose();
    await editor.destroy();
  });
});
