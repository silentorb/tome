import type { GraphNode } from "../shared/types";

function formatDiagnosticLine(key: string, value: string | number | boolean): string {
  return `${key}: ${value}`;
}

export function formatNodeHoverLabel(
  node: Pick<
    GraphNode,
    "title" | "isCluster" | "val" | "relevance" | "bundle"
  >,
  showRelevanceDiagnostics: boolean,
): string {
  const title = node.title;

  if (!showRelevanceDiagnostics) return title;

  const lines = [title];

  if (node.isCluster && node.bundle) {
    lines.push(formatDiagnosticLine("members", node.bundle.memberCount));
    lines.push(formatDiagnosticLine("gateway", node.bundle.gatewayTitle));
    lines.push(formatDiagnosticLine("layer", `${node.bundle.layer}/${node.bundle.layerCount}`));
    return lines.join("\n");
  }

  if (node.relevance) {
    const r = node.relevance;
    lines.push(formatDiagnosticLine("score", Number(r.score.toFixed(3))));
    lines.push(formatDiagnosticLine("hop", r.hop));
    lines.push(formatDiagnosticLine("degree", r.degree));
    lines.push(formatDiagnosticLine("directNeighbor", r.directNeighbor));
    lines.push(formatDiagnosticLine("hopContribution", Number(r.hopContribution.toFixed(3))));
    lines.push(formatDiagnosticLine("degreeContribution", Number(r.degreeContribution.toFixed(3))));
    lines.push(formatDiagnosticLine("directBonus", Number(r.directBonus.toFixed(3))));
    lines.push(formatDiagnosticLine("rank", r.rank));
    lines.push(formatDiagnosticLine("promoted", r.promoted));
  }

  return lines.join("\n");
}

export function formatNodeHoverLines(
  node: Pick<
    GraphNode,
    "title" | "isCluster" | "val" | "relevance" | "bundle"
  >,
  showRelevanceDiagnostics: boolean,
): string[] {
  return formatNodeHoverLabel(node, showRelevanceDiagnostics).split("\n");
}

export interface GraphCanvasLabelStyle {
  textColor: string;
  backgroundColor: string;
  borderColor: string;
}

export interface GraphCanvasLabelLayout {
  x: number;
  y: number;
  offset: number;
  fontSize: number;
  maxWidth: number;
  globalScale: number;
}

function truncateCanvasLabel(
  ctx: CanvasRenderingContext2D,
  label: string,
  maxWidth: number,
): string {
  if (ctx.measureText(label).width <= maxWidth) return label;
  let text = label;
  while (text.length > 1 && ctx.measureText(`${text}…`).width > maxWidth) {
    text = text.slice(0, -1);
  }
  return `${text}…`;
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

export function paintGraphNodeLabelOnCanvas(
  ctx: CanvasRenderingContext2D,
  label: string,
  layout: GraphCanvasLabelLayout,
  style: GraphCanvasLabelStyle,
): void {
  const { x, y, offset, fontSize, maxWidth, globalScale } = layout;
  const padX = 5 / globalScale;
  const padY = 3 / globalScale;
  const radius = 3 / globalScale;
  const labelY = y + offset;

  ctx.font = `${fontSize}px ui-sans-serif, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  const text = truncateCanvasLabel(ctx, label, maxWidth);
  const textWidth = ctx.measureText(text).width;
  const bgWidth = textWidth + padX * 2;
  const bgHeight = fontSize * 1.2 + padY * 2;
  const bgX = x - bgWidth / 2;
  const bgY = labelY;

  ctx.fillStyle = style.backgroundColor;
  roundRectPath(ctx, bgX, bgY, bgWidth, bgHeight, radius);
  ctx.fill();

  ctx.strokeStyle = style.borderColor;
  ctx.lineWidth = Math.max(1 / globalScale, 0.5);
  roundRectPath(ctx, bgX, bgY, bgWidth, bgHeight, radius);
  ctx.stroke();

  ctx.fillStyle = style.textColor;
  ctx.fillText(text, x, bgY + padY);
}
