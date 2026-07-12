import type { SchemaDiagramTheme, SchemaDiagramMemberBadgePosition } from "./config";
import type { ElkEdge, ElkGraph, ElkNode, ElkPoint } from "./build-elk-graph";
import { buildElkGraph } from "./build-elk-graph";
import { layoutElkGraph } from "./layout-elk";
import type { SchemaDiagramSnapshot } from "./snapshot";
import type { SchemaDiagramConfig } from "./config";

const VIEWPORT_PADDING = 24;
const NODE_RX = 6;
const FONT_SIZE = 13;
const ARROW_SIZE = 8;

export interface RenderSchemaDiagramSvgResult {
  svg: string;
  entityCount: number;
  edgeCount: number;
  viewBox: string;
}

interface DiagramPalette {
  nodeFill: string;
  nodeStroke: string;
  nodeText: string;
  edgeStroke: string;
  badgeFill: string;
  badgeText: string;
}

function paletteForTheme(theme: SchemaDiagramTheme): DiagramPalette {
  switch (theme) {
    case "dark":
      return {
        nodeFill: "#2a2a2a",
        nodeStroke: "#666666",
        nodeText: "#ebebea",
        edgeStroke: "#9a9a9a",
        badgeFill: "#e5534b",
        badgeText: "#ffffff",
      };
    case "forest":
      return {
        nodeFill: "#1f2e1f",
        nodeStroke: "#4a7c4a",
        nodeText: "#e8f0e8",
        edgeStroke: "#6b9b6b",
        badgeFill: "#5a9a5a",
        badgeText: "#ffffff",
      };
    case "neutral":
      return {
        nodeFill: "#f0f0f0",
        nodeStroke: "#b0b0b0",
        nodeText: "#333333",
        edgeStroke: "#707070",
        badgeFill: "#d04a42",
        badgeText: "#ffffff",
      };
    default:
      return {
        nodeFill: "#f7f7f7",
        nodeStroke: "#cccccc",
        nodeText: "#222222",
        edgeStroke: "#666666",
        badgeFill: "#e5534b",
        badgeText: "#ffffff",
      };
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function extendBounds(bounds: Bounds, x: number, y: number): void {
  bounds.minX = Math.min(bounds.minX, x);
  bounds.minY = Math.min(bounds.minY, y);
  bounds.maxX = Math.max(bounds.maxX, x);
  bounds.maxY = Math.max(bounds.maxY, y);
}

const BADGE_HEIGHT = 18;
const BADGE_CHAR_WIDTH = 7;
const BADGE_PAD_X = 6;
const BADGE_FONT_SIZE = 11;

export function measureMemberBadgeSize(count: number): { width: number; height: number } {
  const text = String(count);
  const height = BADGE_HEIGHT;
  const width = Math.max(
    height,
    Math.ceil(text.length * BADGE_CHAR_WIDTH + BADGE_PAD_X * 2),
  );
  return { width, height };
}

const BADGE_OVERLAP_X = 0.65;
const BADGE_OVERLAP_Y = 0.35;

export function badgePlacement(
  nodeX: number,
  nodeY: number,
  nodeWidth: number,
  nodeHeight: number,
  badgeWidth: number,
  badgeHeight: number,
  position: SchemaDiagramMemberBadgePosition,
): { x: number; y: number } {
  switch (position) {
    case "top-left":
      return {
        x: nodeX - badgeWidth * (1 - BADGE_OVERLAP_X),
        y: nodeY - badgeHeight * BADGE_OVERLAP_Y,
      };
    case "top-right":
      return {
        x: nodeX + nodeWidth - badgeWidth * BADGE_OVERLAP_X,
        y: nodeY - badgeHeight * BADGE_OVERLAP_Y,
      };
    case "bottom-left":
      return {
        x: nodeX - badgeWidth * (1 - BADGE_OVERLAP_X),
        y: nodeY + nodeHeight - badgeHeight * BADGE_OVERLAP_Y,
      };
    case "bottom-right":
    default:
      return {
        x: nodeX + nodeWidth - badgeWidth * BADGE_OVERLAP_X,
        y: nodeY + nodeHeight - badgeHeight * BADGE_OVERLAP_Y,
      };
  }
}

function extendBoundsForBadge(
  bounds: Bounds,
  nodeX: number,
  nodeY: number,
  nodeWidth: number,
  nodeHeight: number,
  memberCount: number,
  position: SchemaDiagramMemberBadgePosition,
): void {
  if (memberCount <= 0) return;
  const { width, height } = measureMemberBadgeSize(memberCount);
  const { x, y } = badgePlacement(nodeX, nodeY, nodeWidth, nodeHeight, width, height, position);
  extendBounds(bounds, x, y);
  extendBounds(bounds, x + width, y + height);
}

function computeBounds(
  graph: ElkGraph,
  memberCounts: Map<string, number>,
  memberBadgePosition: SchemaDiagramMemberBadgePosition,
): Bounds {
  const bounds: Bounds = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };

  for (const node of graph.children) {
    if (node.x == null || node.y == null || node.width == null || node.height == null) continue;
    extendBounds(bounds, node.x, node.y);
    extendBounds(bounds, node.x + node.width, node.y + node.height);
    extendBoundsForBadge(
      bounds,
      node.x,
      node.y,
      node.width,
      node.height,
      memberCounts.get(node.id) ?? 0,
      memberBadgePosition,
    );
  }

  for (const edge of graph.edges) {
    for (const section of edge.sections ?? []) {
      const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
      for (const point of points) {
        extendBounds(bounds, point.x, point.y);
      }
    }
  }

  if (!Number.isFinite(bounds.minX)) {
    return { minX: 0, minY: 0, maxX: 100, maxY: 60 };
  }

  return bounds;
}

function shiftPoint(point: ElkPoint, offsetX: number, offsetY: number): ElkPoint {
  return { x: point.x - offsetX, y: point.y - offsetY };
}

function polylinePoints(section: NonNullable<ElkEdge["sections"]>[number], offsetX: number, offsetY: number): string {
  const points = [
    section.startPoint,
    ...(section.bendPoints ?? []),
    section.endPoint,
  ].map((point) => shiftPoint(point, offsetX, offsetY));
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

function arrowHeadAtEnd(
  section: NonNullable<ElkEdge["sections"]>[number],
  offsetX: number,
  offsetY: number,
  color: string,
): string {
  const points = [
    section.startPoint,
    ...(section.bendPoints ?? []),
    section.endPoint,
  ];
  if (points.length < 2) return "";

  const end = shiftPoint(points[points.length - 1]!, offsetX, offsetY);
  const prev = shiftPoint(points[points.length - 2]!, offsetX, offsetY);
  const angle = Math.atan2(end.y - prev.y, end.x - prev.x);
  const left = {
    x: end.x - ARROW_SIZE * Math.cos(angle - Math.PI / 6),
    y: end.y - ARROW_SIZE * Math.sin(angle - Math.PI / 6),
  };
  const right = {
    x: end.x - ARROW_SIZE * Math.cos(angle + Math.PI / 6),
    y: end.y - ARROW_SIZE * Math.sin(angle + Math.PI / 6),
  };

  return `<polygon points="${end.x},${end.y} ${left.x},${left.y} ${right.x},${right.y}" fill="${color}" />`;
}

function arrowHeadAtStart(
  section: NonNullable<ElkEdge["sections"]>[number],
  offsetX: number,
  offsetY: number,
  color: string,
): string {
  const points = [
    section.startPoint,
    ...(section.bendPoints ?? []),
    section.endPoint,
  ];
  if (points.length < 2) return "";

  const start = shiftPoint(points[0]!, offsetX, offsetY);
  const next = shiftPoint(points[1]!, offsetX, offsetY);
  const angle = Math.atan2(start.y - next.y, start.x - next.x);
  const left = {
    x: start.x - ARROW_SIZE * Math.cos(angle - Math.PI / 6),
    y: start.y - ARROW_SIZE * Math.sin(angle - Math.PI / 6),
  };
  const right = {
    x: start.x - ARROW_SIZE * Math.cos(angle + Math.PI / 6),
    y: start.y - ARROW_SIZE * Math.sin(angle + Math.PI / 6),
  };

  return `<polygon points="${start.x},${start.y} ${left.x},${left.y} ${right.x},${right.y}" fill="${color}" />`;
}

function renderMemberBadge(
  nodeX: number,
  nodeY: number,
  nodeWidth: number,
  nodeHeight: number,
  count: number,
  palette: DiagramPalette,
  position: SchemaDiagramMemberBadgePosition,
): string {
  if (count <= 0) return "";
  const { width, height } = measureMemberBadgeSize(count);
  const { x, y } = badgePlacement(nodeX, nodeY, nodeWidth, nodeHeight, width, height, position);
  const rx = height / 2;
  const text = String(count);
  return (
    `<g class="schema-diagram-member-badge">` +
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}" ` +
    `fill="${palette.badgeFill}" />` +
    `<text x="${x + width / 2}" y="${y + height / 2}" text-anchor="middle" dominant-baseline="central" ` +
    `fill="${palette.badgeText}" font-size="${BADGE_FONT_SIZE}" font-weight="600" ` +
    `font-family="system-ui, sans-serif">${escapeXml(text)}</text>` +
    `</g>`
  );
}

function renderNode(
  node: ElkNode,
  offsetX: number,
  offsetY: number,
  palette: DiagramPalette,
  memberCount: number,
  memberBadgePosition: SchemaDiagramMemberBadgePosition,
  nodePageHref?: (nodeId: string) => string,
): string {
  if (node.x == null || node.y == null || node.width == null || node.height == null) return "";
  const x = node.x - offsetX;
  const y = node.y - offsetY;
  const title = node.labels?.[0]?.text ?? node.id;
  const textX = x + node.width / 2;
  const textY = y + node.height / 2;

  const body =
    `<g class="schema-diagram-node">` +
    `<rect x="${x}" y="${y}" width="${node.width}" height="${node.height}" rx="${NODE_RX}" ` +
    `fill="${palette.nodeFill}" stroke="${palette.nodeStroke}" stroke-width="1.5" />` +
    `<text x="${textX}" y="${textY}" text-anchor="middle" dominant-baseline="central" ` +
    `fill="${palette.nodeText}" font-size="${FONT_SIZE}" font-family="system-ui, sans-serif">` +
    `${escapeXml(title)}</text>` +
    renderMemberBadge(x, y, node.width, node.height, memberCount, palette, memberBadgePosition) +
    `</g>`;

  const href = nodePageHref?.(node.id)?.trim();
  if (!href) return body;

  return (
    `<a class="schema-diagram-node-link" data-node-id="${escapeXml(node.id)}" href="${escapeXml(href)}">` +
    body +
    `</a>`
  );
}

function renderEdge(edge: ElkEdge, offsetX: number, offsetY: number, palette: DiagramPalette): string {
  const sections = edge.sections ?? [];
  if (sections.length === 0) return "";

  const polylines = sections
    .map((section) => {
      const line =
        `<polyline points="${polylinePoints(section, offsetX, offsetY)}" fill="none" ` +
        `stroke="${palette.edgeStroke}" stroke-width="1.5" />`;
      const endArrow = arrowHeadAtEnd(section, offsetX, offsetY, palette.edgeStroke);
      const startArrow = edge.bidirectional
        ? arrowHeadAtStart(section, offsetX, offsetY, palette.edgeStroke)
        : "";
      return line + startArrow + endArrow;
    })
    .join("");

  return `<g class="schema-diagram-edge">${polylines}</g>`;
}

export function renderLaidOutGraphSvg(
  graph: ElkGraph,
  theme: SchemaDiagramTheme,
  memberCounts: Map<string, number> = new Map(),
  memberBadgePosition: SchemaDiagramMemberBadgePosition = "bottom-right",
  nodePageHref?: (nodeId: string) => string,
): RenderSchemaDiagramSvgResult {
  const palette = paletteForTheme(theme);
  const bounds = computeBounds(graph, memberCounts, memberBadgePosition);
  const offsetX = bounds.minX - VIEWPORT_PADDING;
  const offsetY = bounds.minY - VIEWPORT_PADDING;
  const width = Math.max(bounds.maxX - bounds.minX + VIEWPORT_PADDING * 2, 1);
  const height = Math.max(bounds.maxY - bounds.minY + VIEWPORT_PADDING * 2, 1);
  const viewBox = `0 0 ${Math.ceil(width)} ${Math.ceil(height)}`;

  const edgesMarkup = graph.edges.map((edge) => renderEdge(edge, offsetX, offsetY, palette)).join("");
  const nodesMarkup = graph.children
    .map((node) =>
      renderNode(
        node,
        offsetX,
        offsetY,
        palette,
        memberCounts.get(node.id) ?? 0,
        memberBadgePosition,
        nodePageHref,
      ),
    )
    .join("");

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${Math.ceil(width)}" height="${Math.ceil(height)}" ` +
    `class="schema-diagram-svg">` +
    `<g class="schema-diagram-edges">${edgesMarkup}</g>` +
    `<g class="schema-diagram-nodes">${nodesMarkup}</g>` +
    `</svg>`;

  return {
    svg,
    entityCount: graph.children.length,
    edgeCount: graph.edges.length,
    viewBox,
  };
}

export async function renderSchemaDiagramSvg(
  snapshot: SchemaDiagramSnapshot,
  config: SchemaDiagramConfig,
  nodePageHref?: (nodeId: string) => string,
): Promise<RenderSchemaDiagramSvgResult | null> {
  const built = buildElkGraph(snapshot, config);
  if (built.entityCount === 0) return null;

  const laidOut = await layoutElkGraph(built.graph);
  return renderLaidOutGraphSvg(
    laidOut,
    config.theme,
    built.memberCounts,
    config.memberBadgePosition,
    nodePageHref,
  );
}
