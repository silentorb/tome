import type { SchemaDiagramTheme } from "./config";
import type { ElkEdge, ElkGraph, ElkNode, ElkPoint } from "./build-elk-graph";
import { buildElkGraph, measureEdgeLabelSize } from "./build-elk-graph";
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
  labelFill: string;
  labelText: string;
}

function paletteForTheme(theme: SchemaDiagramTheme): DiagramPalette {
  switch (theme) {
    case "dark":
      return {
        nodeFill: "#2a2a2a",
        nodeStroke: "#666666",
        nodeText: "#ebebea",
        edgeStroke: "#9a9a9a",
        labelFill: "#1e1e1e",
        labelText: "#d4d4d4",
      };
    case "forest":
      return {
        nodeFill: "#1f2e1f",
        nodeStroke: "#4a7c4a",
        nodeText: "#e8f0e8",
        edgeStroke: "#6b9b6b",
        labelFill: "#152015",
        labelText: "#c8dcc8",
      };
    case "neutral":
      return {
        nodeFill: "#f0f0f0",
        nodeStroke: "#b0b0b0",
        nodeText: "#333333",
        edgeStroke: "#707070",
        labelFill: "#ffffff",
        labelText: "#444444",
      };
    default:
      return {
        nodeFill: "#f7f7f7",
        nodeStroke: "#cccccc",
        nodeText: "#222222",
        edgeStroke: "#666666",
        labelFill: "#ffffff",
        labelText: "#333333",
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

function computeBounds(graph: ElkGraph): Bounds {
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
  }

  for (const edge of graph.edges) {
    for (const section of edge.sections ?? []) {
      const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
      for (const point of points) {
        extendBounds(bounds, point.x, point.y);
      }
    }
    for (const label of edge.labels ?? []) {
      const positioned = label as ElkLabelPositioned;
      if (positioned.x == null || positioned.y == null) continue;
      const width = positioned.width ?? 0;
      const height = positioned.height ?? 14;
      extendBounds(bounds, positioned.x, positioned.y);
      extendBounds(bounds, positioned.x + width, positioned.y + height);
    }
  }

  if (!Number.isFinite(bounds.minX)) {
    return { minX: 0, minY: 0, maxX: 100, maxY: 60 };
  }

  return bounds;
}

interface ElkLabelPositioned {
  text: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
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

function arrowHead(
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

function renderNode(node: ElkNode, offsetX: number, offsetY: number, palette: DiagramPalette): string {
  if (node.x == null || node.y == null || node.width == null || node.height == null) return "";
  const x = node.x - offsetX;
  const y = node.y - offsetY;
  const title = node.labels?.[0]?.text ?? node.id;
  const textX = x + node.width / 2;
  const textY = y + node.height / 2;

  return (
    `<g class="schema-diagram-node">` +
    `<rect x="${x}" y="${y}" width="${node.width}" height="${node.height}" rx="${NODE_RX}" ` +
    `fill="${palette.nodeFill}" stroke="${palette.nodeStroke}" stroke-width="1.5" />` +
    `<text x="${textX}" y="${textY}" text-anchor="middle" dominant-baseline="central" ` +
    `fill="${palette.nodeText}" font-size="${FONT_SIZE}" font-family="system-ui, sans-serif">` +
    `${escapeXml(title)}</text>` +
    `</g>`
  );
}

function resolveEdgeLabelBox(label: ElkLabelPositioned): { width: number; height: number } {
  const estimated = measureEdgeLabelSize(label.text);
  const width =
    label.width != null && label.width > 0 ? Math.ceil(label.width) : estimated.width;
  const height =
    label.height != null && label.height > 0 ? Math.ceil(label.height) : estimated.height;
  return { width, height };
}

function renderEdge(edge: ElkEdge, offsetX: number, offsetY: number, palette: DiagramPalette): string {
  const sections = edge.sections ?? [];
  if (sections.length === 0) return "";

  const polylines = sections
    .map(
      (section) =>
        `<polyline points="${polylinePoints(section, offsetX, offsetY)}" fill="none" ` +
        `stroke="${palette.edgeStroke}" stroke-width="1.5" />` +
        arrowHead(section, offsetX, offsetY, palette.edgeStroke),
    )
    .join("");

  const label = edge.labels?.[0] as ElkLabelPositioned | undefined;
  let labelMarkup = "";
  if (label?.text && label.x != null && label.y != null) {
    const { width, height } = resolveEdgeLabelBox(label);
    const lx = label.x - offsetX;
    const ly = label.y - offsetY;
    labelMarkup =
      `<rect x="${lx}" y="${ly}" width="${width}" height="${height}" rx="3" ` +
      `fill="${palette.labelFill}" stroke="${palette.nodeStroke}" stroke-width="1" />` +
      `<text x="${lx + width / 2}" y="${ly + height / 2}" text-anchor="middle" dominant-baseline="central" ` +
      `fill="${palette.labelText}" font-size="11" font-family="system-ui, sans-serif">` +
      `${escapeXml(label.text)}</text>`;
  }

  return `<g class="schema-diagram-edge">${polylines}${labelMarkup}</g>`;
}

export function renderLaidOutGraphSvg(graph: ElkGraph, theme: SchemaDiagramTheme): RenderSchemaDiagramSvgResult {
  const palette = paletteForTheme(theme);
  const bounds = computeBounds(graph);
  const offsetX = bounds.minX - VIEWPORT_PADDING;
  const offsetY = bounds.minY - VIEWPORT_PADDING;
  const width = Math.max(bounds.maxX - bounds.minX + VIEWPORT_PADDING * 2, 1);
  const height = Math.max(bounds.maxY - bounds.minY + VIEWPORT_PADDING * 2, 1);
  const viewBox = `0 0 ${Math.ceil(width)} ${Math.ceil(height)}`;

  const edgesMarkup = graph.edges.map((edge) => renderEdge(edge, offsetX, offsetY, palette)).join("");
  const nodesMarkup = graph.children.map((node) => renderNode(node, offsetX, offsetY, palette)).join("");

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${Math.ceil(width)}" height="${Math.ceil(height)}" ` +
    `class="schema-diagram-svg" role="img" aria-hidden="true">` +
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
): Promise<RenderSchemaDiagramSvgResult | null> {
  const built = buildElkGraph(snapshot, config);
  if (built.entityCount === 0) return null;

  const laidOut = await layoutElkGraph(built.graph);
  return renderLaidOutGraphSvg(laidOut, config.theme);
}
