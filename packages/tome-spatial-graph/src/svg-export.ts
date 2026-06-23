/** Small inset so labels and compound borders are not clipped at the SVG edge. */
export const SVG_EXPORT_PADDING = 12;

export interface SpatialGraphNodeLinkOverlay {
  href: string;
  nodeId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function injectSpatialGraphNodeLinks(
  svg: string,
  links: SpatialGraphNodeLinkOverlay[],
): string {
  if (links.length === 0) return svg;
  const closeTagIndex = svg.lastIndexOf("</svg>");
  if (closeTagIndex < 0) return svg;

  const overlays = links
    .filter(
      (link) =>
        Number.isFinite(link.x) &&
        Number.isFinite(link.y) &&
        Number.isFinite(link.width) &&
        Number.isFinite(link.height) &&
        link.width > 0 &&
        link.height > 0 &&
        link.href.trim().length > 0 &&
        link.nodeId.trim().length > 0,
    )
    .map((link) => {
      const href = escapeAttr(link.href.trim());
      const nodeId = escapeAttr(link.nodeId.trim());
      return (
        `<a class="tome-spatial-graph-node-link" data-node-id="${nodeId}" href="${href}">` +
        `<rect x="${link.x}" y="${link.y}" width="${link.width}" height="${link.height}" fill="transparent" pointer-events="all"/>` +
        "</a>"
      );
    })
    .join("");

  if (!overlays) return svg;
  const layer =
    `<g class="tome-spatial-graph-node-links" fill="none" stroke="none" pointer-events="all">` +
    overlays +
    "</g>";
  return `${svg.slice(0, closeTagIndex)}${layer}${svg.slice(closeTagIndex)}`;
}

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
