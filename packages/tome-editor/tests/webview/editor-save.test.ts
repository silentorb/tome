import { describe, expect, test } from "bun:test";
import { documentsEqual, type NodeBodyDocument } from "tome-graph-interfaces";
import {
  bodyNeedsSave,
  buildPendingSavePayload,
  storageBodyForCreate,
  titleNeedsSave,
} from "../../src/webview/editor-save";

function paragraphDoc(text: string): NodeBodyDocument {
  return {
    version: 1,
    content: text ? [{ type: "paragraph", content: [{ type: "text", text }] }] : [],
  };
}

describe("storageBodyForCreate", () => {
  test("serializes a paragraph without a duplicated title heading", () => {
    expect(storageBodyForCreate(paragraphDoc("Notes")).trim()).toBe("Notes");
  });
});

describe("bodyNeedsSave", () => {
  const notesDoc = paragraphDoc("Notes");

  test("returns false when the document matches the saved baseline", () => {
    expect(bodyNeedsSave(paragraphDoc("Notes"), notesDoc)).toBe(false);
  });

  test("ignores page-block editorHtml when comparing", () => {
    const saved: NodeBodyDocument = {
      version: 1,
      content: [{ type: "page_block", componentId: "demo.block", data: { x: 1 }, editorHtml: "<p>a</p>" }],
    };
    const next: NodeBodyDocument = {
      version: 1,
      content: [{ type: "page_block", componentId: "demo.block", data: { x: 1 }, editorHtml: "<p>b</p>" }],
    };
    expect(documentsEqual(saved, next)).toBe(true);
    expect(bodyNeedsSave(next, saved)).toBe(false);
  });

  test("returns true when content changed", () => {
    expect(bodyNeedsSave(paragraphDoc("More notes"), notesDoc)).toBe(true);
  });

  test("returns false when saved baseline is unset", () => {
    expect(bodyNeedsSave(paragraphDoc("Notes"), null)).toBe(false);
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

  test("returns false for empty or Untitled titles", () => {
    expect(titleNeedsSave("", "Alpha")).toBe(false);
    expect(titleNeedsSave("   ", "Alpha")).toBe(false);
    expect(titleNeedsSave("Untitled", "Alpha")).toBe(false);
  });

  test("returns true when draft baseline is empty and title is persistable", () => {
    expect(titleNeedsSave("Hello", "")).toBe(true);
  });
});

describe("buildPendingSavePayload", () => {
  const notesDoc = paragraphDoc("Notes");
  const moreDoc = paragraphDoc("More");

  test("returns null when nothing is dirty", () => {
    expect(buildPendingSavePayload(notesDoc, "Alpha", notesDoc, "Alpha")).toBeNull();
  });

  test("returns document when body changed", () => {
    expect(buildPendingSavePayload(moreDoc, "Alpha", notesDoc, "Alpha")).toEqual({
      document: moreDoc,
    });
  });

  test("returns title-only when title changed", () => {
    expect(buildPendingSavePayload(notesDoc, "Beta", notesDoc, "Alpha")).toEqual({
      title: "Beta",
    });
  });

  test("omits invalid titles from the patch", () => {
    expect(buildPendingSavePayload(notesDoc, "Untitled", notesDoc, "Alpha")).toBeNull();
    expect(buildPendingSavePayload(notesDoc, "", notesDoc, "Alpha")).toBeNull();
  });

  test("returns both when body and title changed", () => {
    expect(buildPendingSavePayload(moreDoc, "Beta", notesDoc, "Alpha")).toEqual({
      document: moreDoc,
      title: "Beta",
    });
  });

  test("returns null when baselines are unset", () => {
    expect(buildPendingSavePayload(moreDoc, "Beta", null, null)).toBeNull();
  });
});
