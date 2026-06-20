import type { RelationLink } from "../../shared/types";

export const RELATION_CELL_MAX_WIDTH_REM = 14;
export const RELATION_CELL_MAX_LINES = 6;
export const RELATION_CELL_FONT =
  '0.95rem ui-sans-serif, system-ui, sans-serif';

/** Inline icon slot (matches relation-cell-editor.css). */
export const RELATION_CELL_LINK_ICON_SIZE_PX = 20;
export const RELATION_CELL_LINK_ICON_GAP_PX = 4;
export const RELATION_CELL_LINK_ICON_SLOT_PX =
  RELATION_CELL_LINK_ICON_SIZE_PX + RELATION_CELL_LINK_ICON_GAP_PX;

/** Horizontal gap between inline links on the same row (matches relation-cell-editor.css). */
export const RELATION_CELL_LINK_GAP_PX = 6;

export const RELATION_CELL_EDIT_BUTTON_WIDTH_PX = 22;
export const RELATION_CELL_CELL_GAP_PX = 4;

/** Reserved beside the links box for the edit control column + cell gap. */
export const RELATION_CELL_EDIT_GUTTER_PX =
  RELATION_CELL_EDIT_BUTTON_WIDTH_PX + RELATION_CELL_CELL_GAP_PX;

export type MeasureTextWidth = (text: string) => number;

export interface RelationCellDisplayResult {
  text: string;
  visibleLinks: RelationLink[];
  visibleCount: number;
  overflowCount: number;
}

export interface FormatRelationCellDisplayOptions {
  maxWidthPx: number;
  maxLines: number;
  measureWidth: MeasureTextWidth;
  emptyPlaceholder?: string;
}

/** Text used when measuring title wrapping in the cell (icon width is added separately). */
export function relationCellLinkMeasureText(title: string): string {
  return title;
}

export function measureRelationLinkWidth(
  title: string,
  measureWidth: MeasureTextWidth,
): number {
  return RELATION_CELL_LINK_ICON_SLOT_PX + measureWidth(title);
}

function countRelationLinkWrappedLines(
  title: string,
  maxWidthPx: number,
  measureWidth: MeasureTextWidth,
): number {
  const tokens = title.match(/\S+|\s+/g) ?? [title];
  let lines = 1;
  let lineWidth = RELATION_CELL_LINK_ICON_SLOT_PX;
  for (const token of tokens) {
    const tokenWidth = measureWidth(token);
    if (lineWidth + tokenWidth > maxWidthPx) {
      lines += 1;
      lineWidth = tokenWidth;
    } else {
      lineWidth += tokenWidth;
    }
  }
  return lines;
}

/** Count wrapped lines for `text` at `maxWidthPx`. */
export function countWrappedLines(
  text: string,
  maxWidthPx: number,
  measureWidth: MeasureTextWidth,
): number {
  if (!text) return 1;
  const tokens = text.match(/\S+|\s+/g) ?? [text];
  let lines = 1;
  let lineWidth = 0;
  for (const token of tokens) {
    const tokenWidth = measureWidth(token);
    if (lineWidth > 0 && lineWidth + tokenWidth > maxWidthPx) {
      lines += 1;
      lineWidth = tokenWidth;
    } else {
      lineWidth += tokenWidth;
    }
  }
  return lines;
}

export function countRelationLinkLines(
  title: string,
  maxWidthPx: number,
  measureWidth: MeasureTextWidth,
): number {
  const width = measureRelationLinkWidth(title, measureWidth);
  if (width <= maxWidthPx) return 1;
  return countRelationLinkWrappedLines(title, maxWidthPx, measureWidth);
}

function buildDisplayText(visible: RelationLink[], overflowCount: number): string {
  if (visible.length === 0 && overflowCount === 0) return "";
  const prefix = visible.map((link) => link.title).join(" ");
  if (overflowCount <= 0) return prefix;
  const suffix = `${overflowCount}+`;
  return prefix ? `${prefix} ${suffix}` : suffix;
}

function wouldExceedLineBudget(usedLines: number, maxLines: number): boolean {
  return usedLines > maxLines;
}

/**
 * Pack relation links by wrapped line budget with inline flex-wrap row simulation.
 * Long titles wrap instead of being skipped. Always keeps at least the first link.
 */
export function packRelationCellVisibleLinks(
  links: RelationLink[],
  options: FormatRelationCellDisplayOptions,
): RelationLink[] {
  const visible: RelationLink[] = [];
  let usedLines = 0;
  let currentLineWidth = 0;

  for (const link of links) {
    const linkWidth = measureRelationLinkWidth(link.title, options.measureWidth);
    const linkLines = countRelationLinkLines(
      link.title,
      options.maxWidthPx,
      options.measureWidth,
    );

    if (visible.length === 0) {
      visible.push(link);
      usedLines = linkLines;
      currentLineWidth = linkLines === 1 ? linkWidth : 0;
      continue;
    }

    if (linkLines === 1) {
      if (currentLineWidth > 0) {
        const neededWidth = currentLineWidth + RELATION_CELL_LINK_GAP_PX + linkWidth;
        if (neededWidth <= options.maxWidthPx) {
          visible.push(link);
          currentLineWidth = neededWidth;
          continue;
        }
      }

      if (wouldExceedLineBudget(usedLines + 1, options.maxLines)) {
        break;
      }

      visible.push(link);
      usedLines += 1;
      currentLineWidth = linkWidth;
      continue;
    }

    const rowsNeeded = currentLineWidth > 0 ? linkLines + 1 : linkLines;
    if (wouldExceedLineBudget(usedLines + rowsNeeded, options.maxLines)) {
      break;
    }

    visible.push(link);
    usedLines += rowsNeeded;
    currentLineWidth = 0;
  }

  return visible;
}

/**
 * Format relation links for a compact table cell, appending `{n}+` when not all fit.
 */
export function formatRelationCellDisplay(
  links: RelationLink[],
  options: FormatRelationCellDisplayOptions,
): RelationCellDisplayResult {
  const emptyPlaceholder = options.emptyPlaceholder ?? "—";
  if (links.length === 0) {
    return {
      text: emptyPlaceholder,
      visibleLinks: [],
      visibleCount: 0,
      overflowCount: 0,
    };
  }

  const visibleLinks = packRelationCellVisibleLinks(links, options);
  const overflowCount = links.length - visibleLinks.length;
  const text = buildDisplayText(visibleLinks, overflowCount);

  return {
    text,
    visibleLinks,
    visibleCount: visibleLinks.length,
    overflowCount,
  };
}

let canvasMeasure: MeasureTextWidth | null = null;

/** Canvas-based width measure for browser UI (matches RELATION_CELL_FONT). */
export function createCanvasMeasureWidth(font = RELATION_CELL_FONT): MeasureTextWidth {
  return (text: string) => {
    if (!canvasMeasure) {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return text.length * 8;
      ctx.font = font;
      canvasMeasure = (s) => ctx.measureText(s).width;
    }
    return canvasMeasure(text);
  };
}

/** Deterministic measure for unit tests (8px per character). */
export function fixedCharMeasureWidth(charWidth = 8): MeasureTextWidth {
  return (text: string) => text.length * charWidth;
}

export function relationCellMaxWidthPx(
  rootFontSizePx = 16,
  maxWidthRem = RELATION_CELL_MAX_WIDTH_REM,
): number {
  return maxWidthRem * rootFontSizePx;
}
