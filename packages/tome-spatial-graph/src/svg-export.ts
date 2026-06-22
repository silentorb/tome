/** Small inset so labels and compound borders are not clipped at the SVG edge. */
export const SVG_EXPORT_PADDING = 12;

/**
 * Trim exported SVG to its content bounds with a little padding.
 * Uses viewBox + width="100%" so the block scales to the editor column without huge pixel dimensions.
 */
export function trimSpatialGraphSvg(svg: string, padding = SVG_EXPORT_PADDING): string {
  const openTagMatch = svg.match(/^<svg\b([^>]*)>/);
  if (!openTagMatch) return svg;

  const widthMatch = openTagMatch[1].match(/\bwidth="([^"]+)"/);
  const heightMatch = openTagMatch[1].match(/\bheight="([^"]+)"/);
  if (!widthMatch || !heightMatch) return svg;

  const contentWidth = Number.parseFloat(widthMatch[1]);
  const contentHeight = Number.parseFloat(heightMatch[1]);
  if (
    !Number.isFinite(contentWidth) ||
    !Number.isFinite(contentHeight) ||
    contentWidth <= 0 ||
    contentHeight <= 0
  ) {
    return svg;
  }

  const viewWidth = contentWidth + padding * 2;
  const viewHeight = contentHeight + padding * 2;
  const inner = svg.slice(openTagMatch[0].length, svg.lastIndexOf("</svg>"));

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `viewBox="0 0 ${viewWidth} ${viewHeight}" width="100%" preserveAspectRatio="xMidYMid meet">` +
    `<g transform="translate(${padding},${padding})">${inner}</g></svg>`
  );
}
