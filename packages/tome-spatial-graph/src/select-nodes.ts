import type { ExtensionGraphQueryServices, GraphQueryNode } from "tome-interfaces/extension-services/graph-query";
import type { SpatialGraphConfig } from "./config";

export interface SpatialGraphSelection {
  typeId: string;
  nodes: GraphQueryNode[];
  edges: Array<{ id: string; sourceId: string; targetId: string; type: string }>;
}

export async function selectSpatialGraph(
  graphQuery: ExtensionGraphQueryServices | undefined,
  typeId: string,
  config: SpatialGraphConfig,
): Promise<SpatialGraphSelection> {
  if (!graphQuery) {
    return { typeId, nodes: [], edges: [] };
  }

  const nodes = await Promise.resolve(graphQuery.listTypeMembers(typeId));
  const nodeIds = nodes.map((node) => node.id);
  if (nodeIds.length === 0) {
    return { typeId, nodes: [], edges: [] };
  }

  const relationshipTypes = [
    ...config.relationships.parentTypes,
    ...config.relationships.childTypes,
    ...config.relationships.neighborTypes,
  ];

  const edges = await Promise.resolve(
    graphQuery.listEdges({
      nodeIds,
      types: relationshipTypes,
    }),
  );

  return { typeId, nodes, edges };
}
