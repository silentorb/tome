import { forceCollide } from "d3-force-3d";

export const NODE_REL_SIZE = 4;
export const RECORD_COLLISION_PADDING = 8;
export const AGGREGATED_COLLISION_PADDING = 14;

export interface GraphLayoutNode {
  val?: number;
  isCluster?: boolean;
}

export function nodeDisplayValue(node: GraphLayoutNode, aggregated: boolean): number {
  if (aggregated) return Math.max(3, Math.sqrt((node.val ?? 1) + 1) * 2);
  return 1;
}

export function nodeRadius(node: GraphLayoutNode, aggregated: boolean): number {
  return Math.sqrt(Math.max(0, nodeDisplayValue(node, aggregated) || 1)) * NODE_REL_SIZE;
}

export function nodeCollisionRadius(node: GraphLayoutNode, aggregated: boolean): number {
  const padding = aggregated ? AGGREGATED_COLLISION_PADDING : RECORD_COLLISION_PADDING;
  return nodeRadius(node, aggregated) + padding;
}

export function layoutLinkDistance(
  source: GraphLayoutNode,
  target: GraphLayoutNode,
  baseDistance: number,
  aggregated: boolean,
): number {
  return (
    baseDistance +
    nodeCollisionRadius(source, aggregated) +
    nodeCollisionRadius(target, aggregated)
  );
}

export function createCollisionForce(aggregated: boolean) {
  return forceCollide((node: unknown) =>
    nodeCollisionRadius(node as GraphLayoutNode, aggregated),
  )
    .strength(1)
    .iterations(aggregated ? 6 : 2);
}
