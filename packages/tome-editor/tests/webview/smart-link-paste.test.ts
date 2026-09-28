import { describe, expect, test } from "bun:test";
import { defaultValueCtx, Editor, rootCtx } from "@milkdown/core";
import { editorViewCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { TextSelection } from "@milkdown/prose/state";
import {
  applySmartLinkPaste,
  isExternalHttpUrl,
  parseClipboardLink,
  parseSingleHtmlAnchor,
} from "../../src/webview/smart-link-paste";

async function setupEditor(body: string) {
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

function findTextRange(
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

function readFirstLink(view: {
  state: { doc: import("@milkdown/prose/model").Node };
}): { href: string; text: string } | null {
  let found: { href: string; text: string } | null = null;
  view.state.doc.descendants((node) => {
    if (found || !node.isText) return;
    const link = node.marks.find((m) => m.type.name === "link");
    if (link) {
      found = {
        href: String(link.attrs.href ?? ""),
        text: node.text ?? "",
      };
    }
  });
  return found;
}

describe("isExternalHttpUrl", () => {
  test("accepts http(s) absolute URLs", () => {
    expect(isExternalHttpUrl("https://example.com/path")).toBe(true);
    expect(isExternalHttpUrl("http://example.com")).toBe(true);
  });

  test("rejects relative, mailto, node links, and multiline", () => {
    expect(isExternalHttpUrl("?node=abc")).toBe(false);
    expect(isExternalHttpUrl("/path")).toBe(false);
    expect(isExternalHttpUrl("mailto:a@b.com")).toBe(false);
    expect(isExternalHttpUrl("https://example.com\nmore")).toBe(false);
    expect(isExternalHttpUrl("not a url")).toBe(false);
  });
});

describe("parseSingleHtmlAnchor / parseClipboardLink", () => {
  test("extracts titled Edge-style fragment", () => {
    const html = `<html><body><!--StartFragment--><a href="https://example.com/page">Example Page</a><!--EndFragment--></body></html>`;
    expect(parseSingleHtmlAnchor(html)).toEqual({
      href: "https://example.com/page",
      text: "Example Page",
    });
    expect(parseClipboardLink(html, "https://example.com/page")).toEqual({
      href: "https://example.com/page",
      text: "Example Page",
      titled: true,
    });
  });

  test("untitled single anchor falls back to bare URL", () => {
    const html = `<a href="https://example.com/x">https://example.com/x</a>`;
    expect(parseClipboardLink(html, "https://example.com/x")).toEqual({
      href: "https://example.com/x",
      text: "https://example.com/x",
      titled: false,
    });
  });

  test("plain bare URL without HTML", () => {
    expect(parseClipboardLink("", "https://example.com/y")).toEqual({
      href: "https://example.com/y",
      text: "https://example.com/y",
      titled: false,
    });
  });

  test("ignores rich HTML with leftover text or multiple anchors", () => {
    expect(
      parseClipboardLink(
        `<p>See <a href="https://example.com">Example</a> now</p>`,
        "See Example now",
      ),
    ).toBeNull();
    expect(
      parseClipboardLink(
        `<a href="https://a.com">A</a><a href="https://b.com">B</a>`,
        "A B",
      ),
    ).toBeNull();
  });

  test("ignores internal node URLs and non-URL plain text", () => {
    expect(parseClipboardLink("", "?node=01ABC")).toBeNull();
    expect(parseClipboardLink("", "hello world")).toBeNull();
    expect(parseClipboardLink(`<a href="?node=01ABC">Title</a>`, "?node=01ABC")).toBeNull();
  });
});

describe("applySmartLinkPaste", () => {
  test("inserts titled link from clipboard metadata", async () => {
    const { editor } = await setupEditor("Hello");
    await editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const end = view.state.doc.content.size - 1;
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, end)));
      expect(
        applySmartLinkPaste(view, {
          href: "https://example.com/titled",
          text: "Titled Page",
          titled: true,
        }),
      ).toBe(true);
      expect(readFirstLink(view)).toEqual({
        href: "https://example.com/titled",
        text: "Titled Page",
      });
    });
    await editor.destroy();
  });

  test("wraps selection with bare URL", async () => {
    const { editor } = await setupEditor("See selected words here.");
    await editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const { from, to } = findTextRange(view, "selected words");
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)));
      expect(
        applySmartLinkPaste(view, {
          href: "https://example.com/wrap",
          text: "https://example.com/wrap",
          titled: false,
        }),
      ).toBe(true);
      expect(readFirstLink(view)).toEqual({
        href: "https://example.com/wrap",
        text: "selected words",
      });
    });
    await editor.destroy();
  });

  test("empty selection inserts URL as label", async () => {
    const { editor } = await setupEditor("Start ");
    await editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const end = view.state.doc.content.size - 1;
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, end)));
      expect(
        applySmartLinkPaste(view, {
          href: "https://example.com/bare",
          text: "https://example.com/bare",
          titled: false,
        }),
      ).toBe(true);
      expect(readFirstLink(view)).toEqual({
        href: "https://example.com/bare",
        text: "https://example.com/bare",
      });
    });
    await editor.destroy();
  });
});
