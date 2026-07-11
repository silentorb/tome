import { describe, expect, test } from "bun:test";
import {
  editorDynamicNodeHref,
  formatDynamicNodeLink,
} from "tome-flatfile/dynamic-node-links";
import {
  formatEditorDynamicNodeLink,
  formatEditorNodeMarkdownLink,
  prepareEditorMarkdown,
} from "../../src/webview/standalone-markdown";
import { normalizeEditorBody } from "../../src/webview/editor-save";

const TARGET = "0000000000000000000000002X";

describe("prepareEditorMarkdown", () => {
  test("expands storage paths to ?node= hrefs", () => {
    const body = `[Cozy horror](./${TARGET}.md)`;
    const out = prepareEditorMarkdown(body);
    expect(out).toBe(`[Cozy horror](?node=${TARGET})`);
  });

  test("expands dynamic storage syntax to editor links", () => {
    const body = formatDynamicNodeLink(TARGET);
    const out = prepareEditorMarkdown(body, () => "Cozy horror");
    expect(out).toBe(formatEditorDynamicNodeLink(TARGET, "Cozy horror"));
  });

  test("expands absolute editor URLs to ?node= hrefs", () => {
    const body = `[Cozy horror](http://127.0.0.1:5173/?node=${TARGET})`;
    const out = prepareEditorMarkdown(body);
    expect(out).toBe(`[Cozy horror](?node=${TARGET})`);
  });

  test("leaves non-record links unchanged", () => {
    const body = "See [Example](https://example.com).";
    expect(prepareEditorMarkdown(body)).toBe(body);
  });
});

describe("formatEditorDynamicNodeLink", () => {
  test("uses dynamic editor href", () => {
    expect(formatEditorDynamicNodeLink(TARGET, "Cozy horror")).toBe(
      `[Cozy horror](${editorDynamicNodeHref(TARGET)})`,
    );
  });
});

describe("formatEditorNodeMarkdownLink", () => {
  test("uses ?node= href", () => {
    expect(formatEditorNodeMarkdownLink("Cozy horror", TARGET)).toBe(
      `[Cozy horror](?node=${TARGET})`,
    );
  });
});

describe("normalizeEditorBody dynamic links", () => {
  test("round-trips dynamic storage through editor display", () => {
    const storage = `See ${formatDynamicNodeLink(TARGET)} here.`;
    const editor = prepareEditorMarkdown(storage, () => "Cozy horror");
    expect(normalizeEditorBody(editor, "Page")).toBe(storage);
  });
});
