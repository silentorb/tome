import type { TomeGraphStoreBase } from "tome-graph-interfaces";
import { graphGroupForNode, graphLabelsForNode } from "./node-capabilities";
import {
  buildHeuristicLodLevels,
  normalizeExplorerLayerCount,
} from "./graph-lod-cluster";
import { archiveNodeId, resolveWorkspace } from "tome-flatfile";
import { listAllRelationshipProjections } from "./graph-store/relationship-read";

import type {
  GraphLodSnapshot,
  GraphNode,
  GraphNodeBundle,
  GraphNodeRelevance,
  GraphRelationship,
  GraphSnapshot,
} from "tome-graph-interfaces";

export type {
  GraphLodSnapshot,
  GraphNode,
  GraphNodeBundle,
  GraphNodeRelevance,
  GraphRelationship,
  GraphSnapshot,
} from "tome-graph-interfaces";


const GRAPH_CLUSTER_PREFIX = "lod:c:";

export function isGraphClusterNode(node: Pick<GraphNode, "id" | "isCluster">): boolean {
  return node.isCluster === true || node.id.startsWith(GRAPH_CLUSTER_PREFIX);
}

function titleFromNodeProperties(properties: Record<string, unknown>): string {
  const title = properties.title;
  if (typeof title === "string" && title.trim()) return title.trim();
  const alias = properties.alias;
  if (typeof alias === "string" && alias.trim()) return alias.trim();
  return "Untitled";
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

async function collectActiveGraphData(store: TomeGraphStoreBase, contentDir?: string): Promise<{
  nodes: ActiveGraphNode[];
  relationships: ActiveGraphRelationship[];
}> {
  const dir = contentDir ?? store.contentDir;
  const excludedIds = new Set<string>();
  try {
    excludedIds.add(archiveNodeId(dir));
  } catch {
    /* workspace optional */
  }
  for (const id of await store.listNodeIds()) {
    if (await store.isNodeArchived(id)) excludedIds.add(id);
  }

  const nodeIds = (await store.listNodeIds()).filter((id) => !excludedIds.has(id));
  const nodes: ActiveGraphNode[] = [];
  for (const id of nodeIds) {
    const node = await store.getNode(id);
    const properties = node?.properties ?? {};
    nodes.push({
      id,
      title: titleFromNodeProperties(properties),
      group: await graphGroupForNode(store, id),
      labels: await graphLabelsForNode(store, id),
    });
  }

  const relationships = (await listAllRelationshipProjections(store)).filter(
    (relationship) =>
      !excludedIds.has(relationship.sourceNodeId) &&
      !excludedIds.has(relationship.targetNodeId),
  );

  return {
    nodes,
    relationships: relationships.map((relationship) => ({
      id: relationship.id,
      sourceNodeId: relationship.sourceNodeId,
      targetNodeId: relationship.targetNodeId,
      type: relationship.type,
    })),
  };
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

export async function exportFullGraph(
  store: TomeGraphStoreBase,
  contentDir?: string,
): Promise<GraphSnapshot> {
  const { nodes, relationships } = await collectActiveGraphData(store, contentDir);

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

export async function exportExplorerLodGraph(
  store: TomeGraphStoreBase,
  options?: {
    layerCount?: number;
    anchorId?: string;
    contentDir?: string;
  },
): Promise<GraphLodSnapshot> {
  const contentDir = options?.contentDir;
  const layerCount = normalizeExplorerLayerCount(options?.layerCount);
  let { nodes, relationships } = await collectActiveGraphData(store, contentDir);
  let anchorId = options?.anchorId;
  if (!anchorId) {
    try {
      anchorId = resolveWorkspace(contentDir).graphExplorer.defaultAnchorNodeId;
    } catch {
      anchorId = undefined;
    }
  }
  if (anchorId) {
    ({ nodes, relationships } = filterActiveGraphByAnchor(nodes, relationships, anchorId));
  }
  const levels = buildHeuristicLodLevels(nodes, relationships, layerCount, anchorId);

  return {
    layerCount: levels.length,
    levels,
  };
}
