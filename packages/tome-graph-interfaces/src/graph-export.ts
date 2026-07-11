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
