import { describe, expect, test } from "bun:test";
import { bodyNeedsSave, normalizeEditorBody, titleNeedsSave } from "../../src/webview/editor-save";

describe("normalizeEditorBody", () => {
  test("strips duplicate page title before compare", () => {
    expect(normalizeEditorBody("# Alpha\n\nNotes", "Alpha")).toBe("Notes");
  });

  test("canonicalizes node links to relative sibling paths", () => {
    const id = "28358e628ba2807fb560caaac1c4aa47";
    const body = `[Action](http://127.0.0.1:5173/?node=${id})`;
    expect(normalizeEditorBody(body, "Page")).toBe(`[Action](./${id}.md)`);
  });

  test("collapses dynamic editor links to storage syntax", () => {
    const id = "28358e628ba2807fb560caaac1c4aa47";
    const body = `[Target](?dynnode=${id})`;
    expect(normalizeEditorBody(body, "Page")).toBe(`[[${id}]]`);
  });
});

describe("bodyNeedsSave", () => {
  test("returns false when normalized body matches saved baseline", () => {
    expect(bodyNeedsSave("# Alpha\n\nNotes", "Notes", "Alpha")).toBe(false);
  });

  test("returns true when content changed", () => {
    expect(bodyNeedsSave("# Alpha\n\nMore notes", "Notes", "Alpha")).toBe(true);
  });

  test("returns false when saved baseline is unset", () => {
    expect(bodyNeedsSave("Notes", null, "Alpha")).toBe(false);
  });
});

describe("titleNeedsSave", () => {
  test("returns false when title unchanged", () => {
    expect(titleNeedsSave("Alpha", "Alpha")).toBe(false);
  });

  test("returns false for trailing space only (trimmed title unchanged)", () => {
    expect(titleNeedsSave("Alpha ", "Alpha")).toBe(false);
  });

  test("returns true when title changed", () => {
    expect(titleNeedsSave("Beta", "Alpha")).toBe(true);
  });
});
