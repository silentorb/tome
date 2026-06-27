import type cytoscape from "cytoscape";

export interface SpatialGraphNodeLinkOverlay {
  href: string;
  nodeId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function collectSpatialGraphNodeLinkOverlays(
  cy: cytoscape.Core,
  nodePageHref: (nodeId: string) => string,
): SpatialGraphNodeLinkOverlay[] {
  const linkOverlays: SpatialGraphNodeLinkOverlay[] = [];
  for (const node of cy.nodes()) {
    const nodeId = node.data("canonicalId");
    if (typeof nodeId !== "string" || nodeId.length === 0) continue;
    const box = node.renderedBoundingBox();
    linkOverlays.push({
      nodeId,
      href: nodePageHref(nodeId),
      x: box.x1,
      y: box.y1,
      width: box.w,
      height: box.h,
    });
  }
  return linkOverlays;
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
