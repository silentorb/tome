import { type GraphDatabase } from "./graph";
import { graphGroupForNode, graphLabelsForNode } from "./node-capabilities";
import {
  buildHeuristicLodLevels,
  normalizeExplorerLayerCount,
} from "./graph-lod-cluster";
import { archiveNodeId, resolveWorkspace } from "./workspace/resolve";

export interface GraphNodeRelevance {
  score: number;
  hop: number;
  degree: number;
  directNeighbor: boolean;
  hopContribution: number;
  degreeContribution: number;
  directBonus: number;
  rank: number;
  promoted: boolean;
}

export interface GraphNodeBundle {
  memberCount: number;
  gatewayId: string;
  gatewayTitle: string;
  layer: number;
  layerCount: number;
}

export interface GraphNode {
  id: string;
  title: string;
  labels: string[];
  group?: string;
  val?: number;
  isCluster?: boolean;
  relevance?: GraphNodeRelevance;
  bundle?: GraphNodeBundle;
}

export interface GraphRelationship {
  id: string;
  source: string;
  target: string;
  type: string;
  weight?: number;
}

export interface GraphSnapshot {
  nodes: GraphNode[];
  relationships: GraphRelationship[];
}

export interface GraphLodSnapshot {
  layerCount: number;
  /** Index 0 = coarsest (zoomed out), last index = finest (individual records). */
  levels: GraphSnapshot[];
}

const GRAPH_CLUSTER_PREFIX = "lod:c:";

export function isGraphClusterNode(node: Pick<GraphNode, "id" | "isCluster">): boolean {
  return node.isCluster === true || node.id.startsWith(GRAPH_CLUSTER_PREFIX);
}

interface ActiveGraphNode {
  id: string;
  title: string;
  group: string;
  labels: string[];
}

interface ActiveGraphRelationship {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  type: string;
}

function collectActiveGraphData(db: GraphDatabase, contentDir?: string): {
  nodes: ActiveGraphNode[];
  relationships: ActiveGraphRelationship[];
} {
  const allNodes = db.listNodesForGraphExport();
  const excludedIds = new Set<string>([archiveNodeId(contentDir)]);
  for (const node of allNodes) {
    if (db.isNodeArchived(node.id)) excludedIds.add(node.id);
  }

  const nodes = allNodes
    .filter((node) => !excludedIds.has(node.id))
    .map((node) => ({
      ...node,
      group: graphGroupForNode(db, node.id),
      labels: graphLabelsForNode(db, node.id),
    }));
  const relationships = db.listRelationshipsForGraphExport().filter(
    (relationship) =>
      !excludedIds.has(relationship.sourceNodeId) && !excludedIds.has(relationship.targetNodeId),
  );

  return { nodes, relationships };
}

function reachableNodeIds(
  nodes: ActiveGraphNode[],
  relationships: ActiveGraphRelationship[],
  anchorId: string,
): Set<string> | null {
  const nodeIds = new Set(nodes.map((node) => node.id));
  if (!nodeIds.has(anchorId)) return null;

  const adjacency = new Map<string, Set<string>>();
  for (const node of nodes) adjacency.set(node.id, new Set());
  for (const relationship of relationships) {
    adjacency.get(relationship.sourceNodeId)?.add(relationship.targetNodeId);
    adjacency.get(relationship.targetNodeId)?.add(relationship.sourceNodeId);
  }

  const reachable = new Set<string>();
  const queue = [anchorId];

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (reachable.has(id)) continue;
    reachable.add(id);
    for (const neighbor of adjacency.get(id) ?? []) {
      if (!reachable.has(neighbor)) queue.push(neighbor);
    }
  }

  return reachable;
}

function filterActiveGraphByAnchor(
  nodes: ActiveGraphNode[],
  relationships: ActiveGraphRelationship[],
  anchorId: string,
): { nodes: ActiveGraphNode[]; relationships: ActiveGraphRelationship[] } {
  const reachable = reachableNodeIds(nodes, relationships, anchorId);
  if (!reachable) return { nodes, relationships };

  return {
    nodes: nodes.filter((node) => reachable.has(node.id)),
    relationships: relationships.filter(
      (relationship) =>
        reachable.has(relationship.sourceNodeId) && reachable.has(relationship.targetNodeId),
    ),
  };
}

export function exportFullGraph(db: GraphDatabase, contentDir?: string): GraphSnapshot {
  const { nodes, relationships } = collectActiveGraphData(db, contentDir);

  const graphNodes: GraphNode[] = nodes.map((node) => ({
    id: node.id,
    title: node.title,
    labels: node.labels,
    group: node.group,
  }));

  const graphRelationships: GraphRelationship[] = relationships.map((relationship) => ({
    id: relationship.id,
    source: relationship.sourceNodeId,
    target: relationship.targetNodeId,
    type: relationship.type,
  }));

  return { nodes: graphNodes, relationships: graphRelationships };
}

export function exportExplorerLodGraph(
  db: GraphDatabase,
  options?: {
    layerCount?: number;
    anchorId?: string;
    contentDir?: string;
  },
): GraphLodSnapshot {
  const contentDir = options?.contentDir;
  const layerCount = normalizeExplorerLayerCount(options?.layerCount);
  let { nodes, relationships } = collectActiveGraphData(db, contentDir);
  const anchorId =
    options?.anchorId ?? resolveWorkspace(contentDir).graphExplorer.defaultAnchorNodeId;
  if (anchorId) {
    ({ nodes, relationships } = filterActiveGraphByAnchor(nodes, relationships, anchorId));
  }
  const levels = buildHeuristicLodLevels(nodes, relationships, layerCount, anchorId);

  return {
    layerCount: levels.length,
    levels,
  };
}
