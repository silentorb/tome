import type { SchemaDiagramConfig } from "./config";
import { filterSnapshot, type SchemaDiagramSnapshot } from "./snapshot";

export interface ElkLabel {
  text: string;
  width?: number;
  height?: number;
}

export interface ElkNode {
  id: string;
  labels?: ElkLabel[];
  width?: number;
  height?: number;
  x?: number;
  y?: number;
}

export interface ElkPoint {
  x: number;
  y: number;
}

export interface ElkEdgeSection {
  id: string;
  startPoint: ElkPoint;
  endPoint: ElkPoint;
  bendPoints?: ElkPoint[];
}

export interface ElkEdge {
  id: string;
  sources: string[];
  targets: string[];
  labels?: ElkLabel[];
  sections?: ElkEdgeSection[];
}

export interface ElkGraph {
  id: string;
  layoutOptions: Record<string, string>;
  children: ElkNode[];
  edges: ElkEdge[];
}

export interface BuildElkGraphResult {
  graph: ElkGraph;
  entityCount: number;
  edgeCount: number;
}

const CHAR_WIDTH_PX = 8;
const NODE_PADDING_X = 16;
const NODE_PADDING_Y = 12;
const MIN_NODE_WIDTH = 80;
const MIN_NODE_HEIGHT = 36;

const EDGE_LABEL_FONT_SIZE = 11;
const EDGE_LABEL_CHAR_WIDTH = 7;
const EDGE_LABEL_PAD_X = 8;
const EDGE_LABEL_PAD_Y = 5;

export function measureEdgeLabelSize(text: string): { width: number; height: number } {
  return {
    width: Math.max(Math.ceil(text.length * EDGE_LABEL_CHAR_WIDTH + EDGE_LABEL_PAD_X * 2), 24),
    height: EDGE_LABEL_FONT_SIZE + EDGE_LABEL_PAD_Y * 2,
  };
}

export function measureNodeSize(title: string): { width: number; height: number } {
  const textWidth = Math.max(title.length * CHAR_WIDTH_PX, MIN_NODE_WIDTH - NODE_PADDING_X * 2);
  return {
    width: Math.ceil(textWidth + NODE_PADDING_X * 2),
    height: MIN_NODE_HEIGHT,
  };
}

export function buildElkGraph(
  snapshot: SchemaDiagramSnapshot,
  config: SchemaDiagramConfig,
): BuildElkGraphResult {
  const filtered = filterSnapshot(snapshot, config);

  const children: ElkNode[] = filtered.typeTables.map((table) => {
    const size = measureNodeSize(table.title);
    return {
      id: table.id,
      labels: [{ text: table.title }],
      width: size.width,
      height: size.height,
    };
  });

  const edges: ElkEdge[] = [];
  for (const edge of filtered.relationColumnEdges) {
    const sourceExists = children.some((node) => node.id === edge.sourceTypeId);
    const targetExists = children.some((node) => node.id === edge.targetTypeId);
    if (!sourceExists || !targetExists) continue;
    edges.push({
      id: edge.id,
      sources: [edge.sourceTypeId],
      targets: [edge.targetTypeId],
      labels: [{ text: edge.label, ...measureEdgeLabelSize(edge.label) }],
    });
  }

  const graph: ElkGraph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": config.direction === "LR" ? "RIGHT" : "DOWN",
      "elk.spacing.nodeNode": "40",
      "elk.layered.spacing.nodeNodeBetweenLayers": "60",
      "elk.edgeLabels.inline": "true",
    },
    children,
    edges,
  };

  return {
    graph,
    entityCount: children.length,
    edgeCount: edges.length,
  };
}
