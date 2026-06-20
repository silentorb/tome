import { describe, expect, test } from "bun:test";
import {
  countRelationLinkLines,
  countWrappedLines,
  fixedCharMeasureWidth,
  formatRelationCellDisplay,
  packRelationCellVisibleLinks,
  relationCellLinkMeasureText,
  RELATION_CELL_MAX_LINES,
  RELATION_CELL_MAX_WIDTH_REM,
} from "../../../src/webview/components/format-relation-cell-display";

const measure = fixedCharMeasureWidth(8);
const maxWidthPx = RELATION_CELL_MAX_WIDTH_REM * 16;

function format(links: { title: string }[]) {
  return formatRelationCellDisplay(
    links.map((link, index) => ({
      targetId: `${index}`.padStart(32, "a"),
      title: link.title,
    })),
    { maxWidthPx, maxLines: RELATION_CELL_MAX_LINES, measureWidth: measure },
  );
}

describe("formatRelationCellDisplay", () => {
  test("empty links returns placeholder", () => {
    expect(format([])).toEqual({
      text: "—",
      visibleLinks: [],
      visibleCount: 0,
      overflowCount: 0,
    });
  });

  test("single short link fits without suffix", () => {
    const result = format([{ title: "Parent" }]);
    expect(result.text).toBe("Parent");
    expect(result.visibleCount).toBe(1);
    expect(result.overflowCount).toBe(0);
    expect(result.visibleLinks).toEqual([{ targetId: expect.any(String), title: "Parent" }]);
  });

  test("short links pack onto shared rows before overflow", () => {
    const links = Array.from({ length: 10 }, (_, index) => ({
      title: String.fromCharCode(65 + index),
    }));
    const result = format(links);
    expect(result.visibleCount).toBe(10);
    expect(result.overflowCount).toBe(0);
  });

  test("many links append overflow suffix", () => {
    const result = format(
      Array.from({ length: 12 }, (_, index) => ({
        title: `Feature number ${index + 1}`,
      })),
    );
    expect(result.overflowCount).toBeGreaterThan(0);
    expect(result.text).toMatch(/\s\d+\+$/);
    expect(result.visibleCount + result.overflowCount).toBe(12);
  });

  test("overflow suffix is last token", () => {
    const result = format(
      Array.from({ length: 8 }, (_, index) => ({
        title: `Long title for link ${index}`,
      })),
    );
    expect(result.text).toMatch(/\s\d+\+$/);
    const withoutSuffix = result.text.replace(/\s\d+\+$/, "");
    expect(withoutSuffix).not.toContain("+");
  });

  test("long title still shows first link instead of overflow only", () => {
    const wideTitle = "x".repeat(40);
    const result = formatRelationCellDisplay(
      [
        { targetId: "0".padStart(32, "a"), title: wideTitle },
        { targetId: "1".padStart(32, "a"), title: "OK" },
      ],
      { maxWidthPx, maxLines: 1, measureWidth: measure },
    );
    expect(result.visibleLinks).toHaveLength(1);
    expect(result.visibleLinks[0]?.title).toBe(wideTitle);
    expect(result.overflowCount).toBe(1);
    expect(result.text).not.toContain("…");
    expect(result.text).not.toContain("...");
    expect(result.text).toContain(wideTitle);
  });

  test("never returns overflow-only when links exist", () => {
    const wideTitle = "x".repeat(80);
    const result = format([{ title: wideTitle }]);
    expect(result.visibleCount).toBeGreaterThan(0);
    expect(result.text).toContain(wideTitle);
  });
});

describe("packRelationCellVisibleLinks", () => {
  test("packs more short links per line budget than one link per row", () => {
    const links = Array.from({ length: 10 }, (_, index) => ({
      targetId: `${index}`.padStart(32, "a"),
      title: String.fromCharCode(65 + index),
    }));
    const packed = packRelationCellVisibleLinks(links, {
      maxWidthPx,
      maxLines: 1,
      measureWidth: measure,
    });
    expect(packed.length).toBeGreaterThan(1);
  });
});

describe("countRelationLinkLines", () => {
  test("wraps long title across multiple lines", () => {
    const title = "word ".repeat(12).trim();
    expect(countRelationLinkLines(title, 80, measure)).toBeGreaterThan(1);
    expect(relationCellLinkMeasureText(title)).toBe(title);
  });
});

describe("countWrappedLines", () => {
  test("wraps when line exceeds max width", () => {
    const long = "word ".repeat(12).trim();
    expect(countWrappedLines(long, 80, measure)).toBeGreaterThan(1);
  });
});
