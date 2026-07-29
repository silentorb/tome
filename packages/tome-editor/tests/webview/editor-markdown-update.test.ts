import { describe, expect, test } from "bun:test";
import { classifyMarkdownUpdate } from "../../src/webview/editor-markdown-update";

describe("classifyMarkdownUpdate", () => {
  test("ignores updates before baseline is captured at create", () => {
    expect(
      classifyMarkdownUpdate({
        destroyed: false,
        editorReady: true,
        baselineCaptured: false,
        markdown: "a",
        prevMarkdown: "b",
      }),
    ).toBe("ignore");
  });

  test("saves the first real edit after baseline", () => {
    expect(
      classifyMarkdownUpdate({
        destroyed: false,
        editorReady: true,
        baselineCaptured: true,
        markdown: '<!-- tome-page-block {"data":{"reactFlow":{"nodes":[{"id":"in"}]}}} -->',
        prevMarkdown: '<!-- tome-page-block {"data":{"reactFlow":{"nodes":[]}}} -->',
      }),
    ).toBe("save");
  });

  test("ignores no-op markdown", () => {
    expect(
      classifyMarkdownUpdate({
        destroyed: false,
        editorReady: true,
        baselineCaptured: true,
        markdown: "same",
        prevMarkdown: "same",
      }),
    ).toBe("ignore");
  });
});
