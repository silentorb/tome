import { relationshipId } from "./graph";
import type {
  GraphRelationship,
  GraphNode,
  GraphNodeBundle,
  GraphNodeRelevance,
  GraphSnapshot,
} from "./graph-export";

export const DEFAULT_EXPLORER_LOD_LAYER_COUNT = 3;

export const MIN_EXPLORER_LOD_LAYER_COUNT = 2;
export const MAX_EXPLORER_LOD_LAYER_COUNT = 10;

export function normalizeExplorerLayerCount(layerCount?: number): number {
  if (layerCount === undefined) return DEFAULT_EXPLORER_LOD_LAYER_COUNT;
  if (!Number.isFinite(layerCount)) return DEFAULT_EXPLORER_LOD_LAYER_COUNT;
  return Math.min(
    MAX_EXPLORER_LOD_LAYER_COUNT,
    Math.max(MIN_EXPLORER_LOD_LAYER_COUNT, Math.round(layerCount)),
  );
}

export const HOP_WEIGHT = 1.0;
export const DEGREE_WEIGHT = 0.35;
export const DIRECT_NEIGHBOR_BONUS = 0.5;

export const BRANCH_CLUSTER_PREFIX = "branch:";

export interface LodClusterNode {
  id: string;
  title: string;
  group: string;
  labels: string[];
}

export interface LodClusterRelationship {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  type: string;
}

interface RelevanceEntry {
  score: number;
  hop: number;
  degree: number;
  directNeighbor: boolean;
  hopContribution: number;
  degreeContribution: number;
  directBonus: number;
  rank: number;
}

/** Geometric visible-node targets from coarse (index 0) to fine (index layerCount - 1). */
export function layerTargetVisibleCounts(nodeCount: number, layerCount: number): number[] {
  if (nodeCount <= 0) return [];
  if (layerCount <= 1) return [nodeCount];

  const minVisible = Math.max(3, Math.round(Math.cbrt(nodeCount)));
  const targets: number[] = [];

  for (let i = 0; i < layerCount; i++) {
    const t = i / (layerCount - 1);
    const count = Math.round(minVisible * (nodeCount / minVisible) ** t);
    targets.push(Math.min(nodeCount, Math.max(1, count)));
  }

  targets[layerCount - 1] = nodeCount;

  for (let i = 1; i < targets.length; i++) {
    if (targets[i]! < targets[i - 1]!) targets[i] = targets[i - 1]!;
  }

  return targets;
}

/** @deprecated Use layerTargetVisibleCounts */
export const layerTargetClusterCounts = layerTargetVisibleCounts;

export function branchClusterId(gatewayId: string): string {
  return `${BRANCH_CLUSTER_PREFIX}${gatewayId}`;
}

export function gatewayIdFromBranchCluster(clusterId: string): string | null {
  if (!clusterId.startsWith(BRANCH_CLUSTER_PREFIX)) return null;
  return clusterId.slice(BRANCH_CLUSTER_PREFIX.length) || null;
}

function buildAdjacency(
  nodeIds: Set<string>,
  relationships: LodClusterRelationship[],
): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();
  for (const id of nodeIds) adjacency.set(id, new Set());
  for (const relationship of relationships) {
    if (!nodeIds.has(relationship.sourceNodeId) || !nodeIds.has(relationship.targetNodeId)) continue;
    adjacency.get(relationship.sourceNodeId)?.add(relationship.targetNodeId);
    adjacency.get(relationship.targetNodeId)?.add(relationship.sourceNodeId);
  }
  return adjacency;
}

function nodeDegrees(nodeIds: Set<string>, relationships: LodClusterRelationship[]): Map<string, number> {
  const degrees = new Map<string, number>();
  for (const id of nodeIds) degrees.set(id, 0);
  for (const relationship of relationships) {
    if (nodeIds.has(relationship.sourceNodeId)) degrees.set(relationship.sourceNodeId, (degrees.get(relationship.sourceNodeId) ?? 0) + 1);
    if (nodeIds.has(relationship.targetNodeId)) degrees.set(relationship.targetNodeId, (degrees.get(relationship.targetNodeId) ?? 0) + 1);
  }
  return degrees;
}

function hopDistancesFromAnchor(
  anchorId: string,
  adjacency: Map<string, Set<string>>,
): Map<string, number> {
  const hops = new Map<string, number>();
  if (!adjacency.has(anchorId)) return hops;

  const queue = [anchorId];
  hops.set(anchorId, 0);

  while (queue.length > 0) {
    const id = queue.shift()!;
    const nextHop = hops.get(id)! + 1;
    for (const neighbor of adjacency.get(id) ?? []) {
      if (hops.has(neighbor)) continue;
      hops.set(neighbor, nextHop);
      queue.push(neighbor);
    }
  }

  return hops;
}

function buildBfsParents(
  anchorId: string,
  adjacency: Map<string, Set<string>>,
): Map<string, string | null> {
  const parent = new Map<string, string | null>();
  if (!adjacency.has(anchorId)) return parent;

  parent.set(anchorId, null);
  const queue = [anchorId];

  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const neighbor of adjacency.get(id) ?? []) {
      if (parent.has(neighbor)) continue;
      parent.set(neighbor, id);
      queue.push(neighbor);
    }
  }

  return parent;
}

export function computeRelevanceComponents(
  hop: number,
  degree: number,
  directNeighbor: boolean,
): Pick<RelevanceEntry, "hopContribution" | "degreeContribution" | "directBonus" | "score"> {
  const hopContribution = HOP_WEIGHT / (1 + hop);
  const degreeContribution = DEGREE_WEIGHT * Math.log1p(degree);
  const directBonus = directNeighbor ? DIRECT_NEIGHBOR_BONUS : 0;
  return {
    hopContribution,
    degreeContribution,
    directBonus,
    score: hopContribution + degreeContribution + directBonus,
  };
}

function computeRelevanceRanking(
  anchorId: string,
  nodes: LodClusterNode[],
  adjacency: Map<string, Set<string>>,
  hops: Map<string, number>,
  degrees: Map<string, number>,
): Map<string, RelevanceEntry> {
  const ranked = nodes.map((node) => {
    const hop = hops.get(node.id) ?? Number.POSITIVE_INFINITY;
    const degree = degrees.get(node.id) ?? 0;
    const directNeighbor = hop === 1;
    const components = computeRelevanceComponents(hop, degree, directNeighbor);
    return {
      id: node.id,
      hop: Number.isFinite(hop) ? hop : -1,
      degree,
      directNeighbor,
      ...components,
    };
  });

  ranked.sort((a, b) => {
    if (a.id === anchorId) return -1;
    if (b.id === anchorId) return 1;
    if (b.score !== a.score) return b.score - a.score;
    return a.id.localeCompare(b.id);
  });

  const relevance = new Map<string, RelevanceEntry>();
  ranked.forEach((entry, index) => {
    relevance.set(entry.id, {
      score: entry.score,
      hop: entry.hop,
      degree: entry.degree,
      directNeighbor: entry.directNeighbor,
      hopContribution: entry.hopContribution,
      degreeContribution: entry.degreeContribution,
      directBonus: entry.directBonus,
      rank: index + 1,
    });
  });

  return relevance;
}

function promotedSetForBudget(
  anchorId: string,
  nodes: LodClusterNode[],
  relevance: Map<string, RelevanceEntry>,
  budget: number,
): Set<string> {
  const ranked = [...nodes]
    .map((node) => ({
      id: node.id,
      rank: relevance.get(node.id)?.rank ?? Number.POSITIVE_INFINITY,
    }))
    .sort((a, b) => {
      if (a.id === anchorId) return -1;
      if (b.id === anchorId) return 1;
      return a.rank - b.rank;
    });

  const promoted = new Set<string>();
  for (const entry of ranked.slice(0, budget)) promoted.add(entry.id);
  promoted.add(anchorId);
  return promoted;
}

function findGatewayPromoted(
  nodeId: string,
  promoted: Set<string>,
  bfsParent: Map<string, string | null>,
): string {
  let current: string | null = nodeId;
  while (current !== null) {
    if (promoted.has(current)) return current;
    current = bfsParent.get(current) ?? null;
  }
  return nodeId;
}

function buildLayerPartition(
  nodes: LodClusterNode[],
  promoted: Set<string>,
  bfsParent: Map<string, string | null>,
): Map<string, string> {
  const nodeToCluster = new Map<string, string>();

  for (const node of nodes) {
    if (promoted.has(node.id)) {
      nodeToCluster.set(node.id, node.id);
      continue;
    }

    const gatewayId = findGatewayPromoted(node.id, promoted, bfsParent);
    nodeToCluster.set(node.id, branchClusterId(gatewayId));
  }

  mergePromotedGatewaysIntoBranchBundles(nodes, promoted, nodeToCluster);

  return nodeToCluster;
}

/** When a promoted gateway also heads a branch bundle, show one cluster instead of gateway + cluster. */
function mergePromotedGatewaysIntoBranchBundles(
  nodes: LodClusterNode[],
  promoted: Set<string>,
  nodeToCluster: Map<string, string>,
): void {
  for (const node of nodes) {
    if (!promoted.has(node.id)) continue;

    const branchId = branchClusterId(node.id);
    const hasBranchMembers = nodes.some(
      (other) =>
        other.id !== node.id &&
        !promoted.has(other.id) &&
        nodeToCluster.get(other.id) === branchId,
    );
    if (hasBranchMembers) {
      nodeToCluster.set(node.id, branchId);
    }
  }
}

function aggregateRelationships(
  relationships: LodClusterRelationship[],
  nodeToCluster: Map<string, string>,
): GraphRelationship[] {
  const linkCounts = new Map<
    string,
    { source: string; target: string; type: string; weight: number }
  >();

  for (const relationship of relationships) {
    const source = nodeToCluster.get(relationship.sourceNodeId);
    const target = nodeToCluster.get(relationship.targetNodeId);
    if (!source || !target || source === target) continue;

    const key = `${source}:${relationship.type}:${target}`;
    const existing = linkCounts.get(key);
    if (existing) {
      existing.weight += 1;
    } else {
      linkCounts.set(key, {
        source,
        target,
        type: relationship.type,
        weight: 1,
      });
    }
  }

  return [...linkCounts.values()].map((link) => ({
    id: relationshipId(link.source, link.type, link.target),
    source: link.source,
    target: link.target,
    type: link.type,
    weight: link.weight,
  }));
}

function toGraphNodeRelevance(
  entry: RelevanceEntry,
  promoted: boolean,
): GraphNodeRelevance {
  return {
    score: entry.score,
    hop: entry.hop,
    degree: entry.degree,
    directNeighbor: entry.directNeighbor,
    hopContribution: entry.hopContribution,
    degreeContribution: entry.degreeContribution,
    directBonus: entry.directBonus,
    rank: entry.rank,
    promoted,
  };
}

function snapshotFromPartition(
  nodes: LodClusterNode[],
  relationships: LodClusterRelationship[],
  nodeToCluster: Map<string, string>,
  finest: boolean,
  relevance: Map<string, RelevanceEntry>,
  promoted: Set<string>,
  layerIndex: number,
  layerCount: number,
): GraphSnapshot {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const membersByCluster = new Map<string, Set<string>>();

  for (const [nodeId, clusterId] of nodeToCluster) {
    const members = membersByCluster.get(clusterId) ?? new Set<string>();
    members.add(nodeId);
    membersByCluster.set(clusterId, members);
  }

  const graphNodes: GraphNode[] = [];

  for (const [clusterId, members] of membersByCluster) {
    const gatewayId = gatewayIdFromBranchCluster(clusterId) ?? clusterId;
    const representative = nodeById.get(gatewayId);
    if (!representative) continue;

    const memberCount = members.size;
    const isBranchCluster = clusterId.startsWith(BRANCH_CLUSTER_PREFIX) && memberCount > 1;

    if (isBranchCluster) {
      const bundle: GraphNodeBundle = {
        memberCount,
        gatewayId,
        gatewayTitle: representative.title,
        layer: layerIndex + 1,
        layerCount,
      };
      graphNodes.push({
        id: clusterId,
        title: representative.title,
        labels: ["GraphCluster", ...representative.labels],
        group: representative.group,
        val: memberCount,
        isCluster: true,
        bundle,
      });
      continue;
    }

    const entry = relevance.get(clusterId);
    graphNodes.push({
      id: clusterId,
      title: representative.title,
      labels: representative.labels,
      group: representative.group,
      relevance: entry ? toGraphNodeRelevance(entry, promoted.has(clusterId)) : undefined,
    });
  }

  graphNodes.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));

  const graphRelationships: GraphRelationship[] = finest
    ? relationships.map((relationship) => ({
        id: relationship.id,
        source: relationship.sourceNodeId,
        target: relationship.targetNodeId,
        type: relationship.type,
      }))
    : aggregateRelationships(relationships, nodeToCluster);

  return { nodes: graphNodes, relationships: graphRelationships };
}

function buildAnchorCentricPartitions(
  anchorId: string,
  nodes: LodClusterNode[],
  relationships: LodClusterRelationship[],
  layerCount: number,
): Map<string, string>[] {
  if (nodes.length === 0) return [];

  const nodeIds = new Set(nodes.map((node) => node.id));
  const adjacency = buildAdjacency(nodeIds, relationships);
  const hops = hopDistancesFromAnchor(anchorId, adjacency);
  const degrees = nodeDegrees(nodeIds, relationships);
  const bfsParent = buildBfsParents(anchorId, adjacency);
  const relevance = computeRelevanceRanking(anchorId, nodes, adjacency, hops, degrees);
  const budgets = layerTargetVisibleCounts(nodes.length, layerCount);

  return budgets.map((budget) => {
    const promoted = promotedSetForBudget(anchorId, nodes, relevance, budget);
    return buildLayerPartition(nodes, promoted, bfsParent);
  });
}

export function buildHeuristicLodLevels(
  nodes: LodClusterNode[],
  relationships: LodClusterRelationship[],
  layerCount = DEFAULT_EXPLORER_LOD_LAYER_COUNT,
  anchorId?: string,
): GraphSnapshot[] {
  if (nodes.length === 0) return [];

  const resolvedAnchor = anchorId ?? nodes[0]!.id;
  const nodeIds = new Set(nodes.map((node) => node.id));
  const adjacency = buildAdjacency(nodeIds, relationships);
  const hops = hopDistancesFromAnchor(resolvedAnchor, adjacency);
  const degrees = nodeDegrees(nodeIds, relationships);
  const bfsParent = buildBfsParents(resolvedAnchor, adjacency);
  const relevance = computeRelevanceRanking(resolvedAnchor, nodes, adjacency, hops, degrees);
  const budgets = layerTargetVisibleCounts(nodes.length, layerCount);
  const partitions = buildAnchorCentricPartitions(resolvedAnchor, nodes, relationships, layerCount);

  return partitions.map((partition, index) => {
    const promoted = promotedSetForBudget(resolvedAnchor, nodes, relevance, budgets[index]!);
    return snapshotFromPartition(
      nodes,
      relationships,
      partition,
      index === partitions.length - 1,
      relevance,
      promoted,
      index,
      layerCount,
    );
  });
}

export function buildHeuristicLodLevelsFromCounts(
  nodes: LodClusterNode[],
  relationships: LodClusterRelationship[],
  layerCount: number,
  anchorId?: string,
): { targets: number[]; levels: GraphSnapshot[] } {
  const targets = layerTargetVisibleCounts(nodes.length, layerCount);
  const levels = buildHeuristicLodLevels(nodes, relationships, layerCount, anchorId);
  return { targets, levels };
}
