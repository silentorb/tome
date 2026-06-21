import type { GraphQueryEdge, GraphQueryNode } from "tome-interfaces/extension-services/graph-query";
import type { SpatialGraphConfig } from "./config";

export interface SpatialPlacement {
  elementId: string;
  canonicalId: string;
  title: string;
  parentElementId?: string;
}

export interface CytoscapeElementDefinition {
  group: "nodes" | "edges";
  data: Record<string, string | undefined>;
  classes?: string;
}

export const PARENT_LABEL_NODE_SUFFIX = "__label";
export const PARENT_LABEL_NODE_CLASS = "parent-label";

function buildParentMap(
  nodes: GraphQueryNode[],
  edges: GraphQueryEdge[],
  config: SpatialGraphConfig,
): Map<string, Set<string>> {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const parentTypes = new Set(config.relationships.parentTypes);
  const childTypes = new Set(config.relationships.childTypes);
  const parentMap = new Map<string, Set<string>>();

  const addParent = (childId: string, parentId: string) => {
    if (!nodeIds.has(childId) || !nodeIds.has(parentId)) return;
    const parents = parentMap.get(childId) ?? new Set<string>();
    parents.add(parentId);
    parentMap.set(childId, parents);
  };

  for (const edge of edges) {
    if (parentTypes.has(edge.type)) {
      addParent(edge.sourceId, edge.targetId);
    }
    if (childTypes.has(edge.type)) {
      addParent(edge.targetId, edge.sourceId);
    }
  }

  return parentMap;
}

function buildPlacements(
  nodes: GraphQueryNode[],
  parentMap: Map<string, Set<string>>,
): SpatialPlacement[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const placementsByCanonical = new Map<string, SpatialPlacement[]>();

  const parentsFor = (canonicalId: string): string[] =>
    [...(parentMap.get(canonicalId) ?? [])].filter((parentId) => nodeById.has(parentId));

  const ensurePlacements = (canonicalId: string, visiting: Set<string>): SpatialPlacement[] => {
    const cached = placementsByCanonical.get(canonicalId);
    if (cached) return cached;

    const node = nodeById.get(canonicalId);
    if (!node) return [];

    if (visiting.has(canonicalId)) {
      const rootPlacement: SpatialPlacement = {
        elementId: canonicalId,
        canonicalId,
        title: node.title,
      };
      placementsByCanonical.set(canonicalId, [rootPlacement]);
      return [rootPlacement];
    }

    visiting.add(canonicalId);
    const parents = parentsFor(canonicalId);
    if (parents.length === 0) {
      const rootPlacement: SpatialPlacement = {
        elementId: canonicalId,
        canonicalId,
        title: node.title,
      };
      placementsByCanonical.set(canonicalId, [rootPlacement]);
      visiting.delete(canonicalId);
      return [rootPlacement];
    }

    const placements: SpatialPlacement[] = [];
    for (const parentId of parents) {
      const parentPlacements = ensurePlacements(parentId, visiting);
      for (const parentPlacement of parentPlacements) {
        placements.push({
          elementId: `${canonicalId}@${parentPlacement.elementId}`,
          canonicalId,
          title: node.title,
          parentElementId: parentPlacement.elementId,
        });
      }
    }

    placementsByCanonical.set(canonicalId, placements);
    visiting.delete(canonicalId);
    return placements;
  };

  const allPlacements: SpatialPlacement[] = [];
  for (const node of nodes) {
    for (const placement of ensurePlacements(node.id, new Set())) {
      allPlacements.push(placement);
    }
  }

  return allPlacements;
}

function neighborPairs(
  edges: GraphQueryEdge[],
  neighborTypes: Set<string>,
): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  const seen = new Set<string>();

  for (const edge of edges) {
    if (!neighborTypes.has(edge.type)) continue;
    const a = edge.sourceId;
    const b = edge.targetId;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push([a, b]);
  }

  return pairs;
}

/** Lay out parent titles as child nodes so fcose positions them with siblings, not centered on the compound box. */
function appendParentLabelNodes(nodeElements: Map<string, CytoscapeElementDefinition>): void {
  const parentIds = new Set<string>();
  for (const element of nodeElements.values()) {
    const parentId = element.data.parent;
    if (parentId) parentIds.add(parentId);
  }

  for (const parentId of parentIds) {
    const parent = nodeElements.get(parentId);
    if (!parent) continue;

    const label = parent.data.label ?? "";
    parent.data.label = "";

    nodeElements.set(`${parentId}${PARENT_LABEL_NODE_SUFFIX}`, {
      group: "nodes",
      data: {
        id: `${parentId}${PARENT_LABEL_NODE_SUFFIX}`,
        label,
        parent: parentId,
      },
      classes: PARENT_LABEL_NODE_CLASS,
    });
  }
}

export function buildSpatialGraphElements(
  nodes: GraphQueryNode[],
  edges: GraphQueryEdge[],
  config: SpatialGraphConfig,
): CytoscapeElementDefinition[] {
  const parentMap = buildParentMap(nodes, edges, config);
  const placements = buildPlacements(nodes, parentMap);
  const placementByCanonical = new Map<string, SpatialPlacement[]>();

  for (const placement of placements) {
    const list = placementByCanonical.get(placement.canonicalId) ?? [];
    list.push(placement);
    placementByCanonical.set(placement.canonicalId, list);
  }

  const nodeElements = new Map<string, CytoscapeElementDefinition>();
  for (const placement of placements) {
    nodeElements.set(placement.elementId, {
      group: "nodes",
      data: {
        id: placement.elementId,
        label: placement.title,
        canonicalId: placement.canonicalId,
        parent: placement.parentElementId,
      },
    });
  }

  appendParentLabelNodes(nodeElements);

  const neighborTypeSet = new Set(config.relationships.neighborTypes);
  const edgeElements: CytoscapeElementDefinition[] = [];
  let edgeIndex = 0;

  for (const [sourceCanonical, targetCanonical] of neighborPairs(edges, neighborTypeSet)) {
    const sourcePlacements = placementByCanonical.get(sourceCanonical) ?? [];
    const targetPlacements = placementByCanonical.get(targetCanonical) ?? [];
    for (const source of sourcePlacements) {
      for (const target of targetPlacements) {
        edgeElements.push({
          group: "edges",
          data: {
            id: `neighbor-${edgeIndex++}`,
            source: source.elementId,
            target: target.elementId,
          },
        });
      }
    }
  }

  return [...nodeElements.values(), ...edgeElements];
}

export { buildParentMap, buildPlacements };
