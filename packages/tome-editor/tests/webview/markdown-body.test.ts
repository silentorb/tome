import { describe, expect, test } from "bun:test";
import {
  isEffectivelyEmptyMarkdown,
  resolvePageTitleAndContent,
  stripLeadingTitleHeading,
} from "../../src/webview/markdown-body";

describe("resolvePageTitleAndContent", () => {
  test("extracts duplicate page title from leading h1", () => {
    expect(resolvePageTitleAndContent("# Alpha\n\nNotes here.", "Alpha")).toEqual({
      title: "Alpha",
      content: "Notes here.",
    });
  });

  test("keeps leading h1 when it does not match the stored title", () => {
    expect(resolvePageTitleAndContent("# Composition\n\nNotes here.", "Page title")).toEqual({
      title: "Page title",
      content: "# Composition\n\nNotes here.",
    });
  });

  test("falls back to stored title when body has no leading h1", () => {
    expect(resolvePageTitleAndContent("Plain paragraph", "Alpha")).toEqual({
      title: "Alpha",
      content: "Plain paragraph",
    });
  });
});

describe("stripLeadingTitleHeading", () => {
  test("removes a leading title heading when it matches the page title", () => {
    expect(stripLeadingTitleHeading("# Alpha\n\nNotes here.", "Alpha")).toBe("Notes here.");
  });

  test("keeps a leading h1 that is section content, not the page title", () => {
    expect(stripLeadingTitleHeading("# Composition\n\nNotes here.", "Page title")).toBe(
      "# Composition\n\nNotes here.",
    );
  });

  test("leaves body unchanged when no leading h1", () => {
    expect(stripLeadingTitleHeading("## Section\n\nNotes", "Alpha")).toBe("## Section\n\nNotes");
  });
});

describe("isEffectivelyEmptyMarkdown", () => {
  test("treats blank bodies as empty", () => {
    expect(isEffectivelyEmptyMarkdown("", "Alpha")).toBe(true);
    expect(isEffectivelyEmptyMarkdown("   \n  ", "Alpha")).toBe(true);
  });

  test("treats title-only heading as empty", () => {
    expect(isEffectivelyEmptyMarkdown("# Alpha", "Alpha")).toBe(true);
    expect(isEffectivelyEmptyMarkdown("# Alpha\n", "Alpha")).toBe(true);
  });

  test("keeps real markdown content", () => {
    expect(isEffectivelyEmptyMarkdown("# Alpha\n\nNotes here.", "Alpha")).toBe(false);
    expect(isEffectivelyEmptyMarkdown("Plain paragraph", "Alpha")).toBe(false);
  });
});
