import { describe, expect, test } from "bun:test";
import {
  editorDynamicNodeHref,
  formatDynamicNodeLink,
} from "tome-db/dynamic-node-links";
import {
  formatEditorDynamicNodeLink,
  formatEditorNodeMarkdownLink,
  prepareEditorMarkdown,
} from "../../src/webview/standalone-markdown";
import { normalizeEditorBody } from "../../src/webview/editor-save";

const TARGET = "e5cc80dc61ed4c629951cdf472b20b7a";

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

  test("rewrites notion export links to navigable hrefs", () => {
    const body = "See [Cozy horror](Cozy%20horror%20e5cc80dc61ed4c629951cdf472b20b7a.md).";
    const out = prepareEditorMarkdown(body);
    expect(out).toContain(`?node=${TARGET}`);
    expect(out).not.toContain("Cozy%20horror");
    expect(out).not.toContain(`./${TARGET}.md`);
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
