export interface GraphQueryNode {
  id: string;
  title: string;
}

export interface GraphQueryEdge {
  id: string;
  sourceId: string;
  targetId: string;
  type: string;
}

export interface ExtensionGraphQueryServices {
  listTypeMembers(typeId: string): GraphQueryNode[] | Promise<GraphQueryNode[]>;
  listEdges(options: {
    nodeIds: readonly string[];
    types?: readonly string[];
  }): GraphQueryEdge[] | Promise<GraphQueryEdge[]>;
}
