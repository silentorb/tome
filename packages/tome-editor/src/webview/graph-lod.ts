import type { GraphLodSnapshot } from "tome-db";
import type { GraphExplorerMode } from "./graph-preferences";

export function defaultExplorerLayerIndex(_layerCount: number): number {
  return 0;
}

export function clusterGatewayId(node: {
  isCluster?: boolean;
  bundle?: { gatewayId: string };
}): string | null {
  if (!node.isCluster || !node.bundle?.gatewayId) return null;
  return node.bundle.gatewayId;
}

export function relativeExplorerLayerIndex(
  layerCount: number,
  relativeDetailLevel: number,
): number {
  if (layerCount <= 1) return 0;
  const clampedLevel = Math.min(layerCount, Math.max(1, Math.round(relativeDetailLevel)));
  return clampedLevel - 1;
}

export function isDrillableClusterNode(node: { isCluster?: boolean }): boolean {
  return Boolean(node.isCluster);
}

export function canDrillDownLayer(layerIndex: number, layerCount: number): boolean {
  return layerIndex < layerCount - 1;
}

export function canDrillUpLayer(layerIndex: number): boolean {
  return layerIndex > 0;
}

export function nextExplorerLayerIndex(currentIndex: number, layerCount: number): number {
  return Math.min(layerCount - 1, currentIndex + 1);
}

export function previousExplorerLayerIndex(currentIndex: number): number {
  return Math.max(0, currentIndex - 1);
}

export function graphLodLayerLabel(layerIndex: number, layerCount: number): string {
  if (layerCount <= 1) return "Records";
  return `Layer ${layerIndex + 1}/${layerCount}`;
}

export function pickExplorerSnapshot(lod: GraphLodSnapshot, layerIndex: number): GraphLodSnapshot["levels"][number] {
  const clamped = Math.min(lod.levels.length - 1, Math.max(0, layerIndex));
  return lod.levels[clamped] ?? { nodes: [], relationships: [] };
}

export function isOpenableGraphNode(node: { id: string; isCluster?: boolean }): boolean {
  if (node.isCluster) return false;
  return /^[a-f0-9]{32}$/i.test(node.id);
}

export function isAggregatedLayer(layerIndex: number, layerCount: number): boolean {
  return layerIndex < layerCount - 1;
}

export function layerForceSettings(layerIndex: number, layerCount: number): {
  charge: number;
  linkDistance: number;
  cooldownTicks: number;
} {
  if (layerCount <= 1) {
    return { charge: -40, linkDistance: 30, cooldownTicks: 80 };
  }

  const t = layerIndex / (layerCount - 1);
  return {
    charge: -220 + t * 180,
    linkDistance: 90 - t * 60,
    cooldownTicks: Math.round(140 - t * 40),
  };
}

export function explorerToolbarTitle(
  mode: GraphExplorerMode,
  options: {
    anchorTitle?: string;
    layerIndex?: number;
    layerCount?: number;
  },
): string {
  if (mode === "relative") {
    const base = options.anchorTitle
      ? `Graph Explorer · ${options.anchorTitle}`
      : "Graph Explorer";
    if (options.layerIndex !== undefined && options.layerCount !== undefined && options.layerCount > 1) {
      return `${base} · ${graphLodLayerLabel(options.layerIndex, options.layerCount)}`;
    }
    return base;
  }
  if (options.layerIndex === undefined || options.layerCount === undefined) {
    return "Graph Explorer";
  }
  return `Graph Explorer · ${graphLodLayerLabel(options.layerIndex, options.layerCount)}`;
}

export function explorerInteractionHint(
  mode: GraphExplorerMode,
  layerIndex: number,
  layerCount: number,
): string {
  if (mode === "relative") return "Click clusters to explore branches";
  if (canDrillDownLayer(layerIndex, layerCount)) {
    return "Click cluster nodes to drill down";
  }
  return "Click nodes to open records";
}

export function resolveAnchorTitleFromSnapshot(
  snapshot: GraphLodSnapshot["levels"][number] | null,
  anchorId?: string,
): string | undefined {
  if (!snapshot || !anchorId) return undefined;
  const direct = snapshot.nodes.find((node) => node.id === anchorId);
  if (direct) return direct.title;
  const cluster = snapshot.nodes.find((node) => node.bundle?.gatewayId === anchorId);
  return cluster?.title;
}
