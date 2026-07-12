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
  bidirectional?: boolean;
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
  memberCounts: Map<string, number>;
}

const CHAR_WIDTH_PX = 8;
const NODE_PADDING_X = 16;
const NODE_PADDING_Y = 12;
const MIN_NODE_WIDTH = 80;
const MIN_NODE_HEIGHT = 36;

export interface DiagramRelationEdge {
  id: string;
  sourceTypeId: string;
  targetTypeId: string;
  bidirectional?: boolean;
}

export function mergeBidirectionalEdges(
  edges: Array<{ id: string; sourceTypeId: string; targetTypeId: string; label: string }>,
): DiagramRelationEdge[] {
  const byPair = new Map<string, typeof edges>();
  for (const edge of edges) {
    const minId =
      edge.sourceTypeId < edge.targetTypeId ? edge.sourceTypeId : edge.targetTypeId;
    const maxId =
      edge.sourceTypeId < edge.targetTypeId ? edge.targetTypeId : edge.sourceTypeId;
    const key = `${minId}|${maxId}`;
    const group = byPair.get(key);
    if (group) group.push(edge);
    else byPair.set(key, [edge]);
  }

  const merged: DiagramRelationEdge[] = [];
  for (const [key, group] of byPair) {
    const [minId, maxId] = key.split("|") as [string, string];
    const forward = group.filter(
      (edge) => edge.sourceTypeId === minId && edge.targetTypeId === maxId,
    );
    const reverse = group.filter(
      (edge) => edge.sourceTypeId === maxId && edge.targetTypeId === minId,
    );

    if (forward.length > 0 && reverse.length > 0) {
      merged.push({
        id: key,
        sourceTypeId: minId,
        targetTypeId: maxId,
        bidirectional: true,
      });
      continue;
    }

    for (const edge of group) {
      merged.push({
        id: edge.id,
        sourceTypeId: edge.sourceTypeId,
        targetTypeId: edge.targetTypeId,
        bidirectional: false,
      });
    }
  }

  return merged;
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

  const memberCounts = new Map<string, number>();
  const children: ElkNode[] = filtered.typeTables.map((table) => {
    memberCounts.set(table.id, table.memberCount ?? 0);
    const size = measureNodeSize(table.title);
    return {
      id: table.id,
      labels: [{ text: table.title }],
      width: size.width,
      height: size.height,
    };
  });

  const edges: ElkEdge[] = [];
  for (const edge of mergeBidirectionalEdges(filtered.relationColumnEdges)) {
    const sourceExists = children.some((node) => node.id === edge.sourceTypeId);
    const targetExists = children.some((node) => node.id === edge.targetTypeId);
    if (!sourceExists || !targetExists) continue;
    edges.push({
      id: edge.id,
      sources: [edge.sourceTypeId],
      targets: [edge.targetTypeId],
      ...(edge.bidirectional ? { bidirectional: true } : {}),
    });
  }

  const graph: ElkGraph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": config.direction === "LR" ? "RIGHT" : "DOWN",
      "elk.spacing.nodeNode": "40",
      "elk.layered.spacing.nodeNodeBetweenLayers": "60",
    },
    children,
    edges,
  };

  return {
    graph,
    entityCount: children.length,
    edgeCount: edges.length,
    memberCounts,
  };
}
