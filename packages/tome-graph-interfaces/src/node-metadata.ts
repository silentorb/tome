export interface NodeBacklink {
  sourceId: string;
  title: string;
  linkText: string | null;
}

export interface NodePageMetadata {
  createdAt: string | null;
  modifiedAt: string | null;
  relationshipCount: number;
  backlinks: NodeBacklink[];
}
