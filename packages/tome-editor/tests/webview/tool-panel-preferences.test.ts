import { beforeEach, describe, expect, test } from "bun:test";
import {
  DEFAULT_TOOL_PANEL_WIDTH_PX,
  MIN_MAIN_CONTENT_WIDTH_PX,
  MIN_TOOL_PANEL_WIDTH_PX,
  TOOL_PANEL_WIDTH_KEY,
  clampToolPanelWidthPx,
  readToolPanelWidthPx,
  writeToolPanelWidthPx,
} from "../../src/webview/tool-panel-preferences";

describe("tool panel preferences", () => {
  beforeEach(() => {
    localStorage.removeItem(TOOL_PANEL_WIDTH_KEY);
  });

  test("clamp enforces min width", () => {
    expect(clampToolPanelWidthPx(100)).toBe(MIN_TOOL_PANEL_WIDTH_PX);
  });

  test("clamp enforces viewport fraction max", () => {
    expect(clampToolPanelWidthPx(2000, { viewportWidthPx: 1000 })).toBe(400);
  });

  test("clamp leaves room for main content from layout width", () => {
    expect(clampToolPanelWidthPx(2000, { layoutWidthPx: 1000 })).toBe(
      1000 - MIN_MAIN_CONTENT_WIDTH_PX,
    );
  });

  test("clamp uses default for non-finite input", () => {
    expect(clampToolPanelWidthPx(Number.NaN)).toBe(DEFAULT_TOOL_PANEL_WIDTH_PX);
  });

  test("read returns default when unset", () => {
    expect(readToolPanelWidthPx()).toBe(DEFAULT_TOOL_PANEL_WIDTH_PX);
  });

  test("write/read round-trips a clamped width", () => {
    const saved = writeToolPanelWidthPx(512);
    expect(saved).toBe(512);
    expect(localStorage.getItem(TOOL_PANEL_WIDTH_KEY)).toBe("512");
    expect(readToolPanelWidthPx()).toBe(512);
  });

  test("read re-clamps stored value against current viewport", () => {
    localStorage.setItem(TOOL_PANEL_WIDTH_KEY, "900");
    expect(readToolPanelWidthPx({ viewportWidthPx: 1000 })).toBe(400);
  });
});
