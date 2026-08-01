/** Local chrome preference for the host right tool panel width. */

export const TOOL_PANEL_WIDTH_KEY = "tome.toolPanel.widthPx";

/** Matches historical CSS `--tome-tool-panel-width: 28rem` at 16px root. */
export const DEFAULT_TOOL_PANEL_WIDTH_PX = 28 * 16;

/** Matches historical CSS `min-width: 22.5rem` at 16px root. */
export const MIN_TOOL_PANEL_WIDTH_PX = 22.5 * 16;

/** Floor for `.tome-main` when computing max panel width from layout width. */
export const MIN_MAIN_CONTENT_WIDTH_PX = 20 * 16;

/** Historical CSS `max-width: 40vw` — also used when viewport width is known. */
export const MAX_TOOL_PANEL_VIEWPORT_FRACTION = 0.4;

export function clampToolPanelWidthPx(
  widthPx: number,
  options?: { viewportWidthPx?: number; layoutWidthPx?: number },
): number {
  if (!Number.isFinite(widthPx)) return DEFAULT_TOOL_PANEL_WIDTH_PX;

  const caps: number[] = [];
  const viewportWidth = options?.viewportWidthPx;
  if (typeof viewportWidth === "number" && Number.isFinite(viewportWidth) && viewportWidth > 0) {
    caps.push(viewportWidth * MAX_TOOL_PANEL_VIEWPORT_FRACTION);
  }
  const layoutWidth = options?.layoutWidthPx;
  if (typeof layoutWidth === "number" && Number.isFinite(layoutWidth) && layoutWidth > 0) {
    caps.push(layoutWidth - MIN_MAIN_CONTENT_WIDTH_PX);
  }

  let max = caps.length > 0 ? Math.min(...caps) : Number.POSITIVE_INFINITY;
  if (max < MIN_TOOL_PANEL_WIDTH_PX) {
    max = MIN_TOOL_PANEL_WIDTH_PX;
  }

  const rounded = Math.round(widthPx);
  if (!Number.isFinite(max)) {
    return Math.max(MIN_TOOL_PANEL_WIDTH_PX, rounded);
  }
  return Math.min(max, Math.max(MIN_TOOL_PANEL_WIDTH_PX, rounded));
}

export function readToolPanelWidthPx(options?: {
  viewportWidthPx?: number;
  layoutWidthPx?: number;
}): number {
  try {
    const raw = localStorage.getItem(TOOL_PANEL_WIDTH_KEY);
    if (raw === null) {
      return clampToolPanelWidthPx(DEFAULT_TOOL_PANEL_WIDTH_PX, options);
    }
    return clampToolPanelWidthPx(Number.parseFloat(raw), options);
  } catch {
    return clampToolPanelWidthPx(DEFAULT_TOOL_PANEL_WIDTH_PX, options);
  }
}

export function writeToolPanelWidthPx(
  widthPx: number,
  options?: { viewportWidthPx?: number; layoutWidthPx?: number },
): number {
  const clamped = clampToolPanelWidthPx(widthPx, options);
  try {
    localStorage.setItem(TOOL_PANEL_WIDTH_KEY, String(clamped));
  } catch {
    /* storage unavailable */
  }
  return clamped;
}
