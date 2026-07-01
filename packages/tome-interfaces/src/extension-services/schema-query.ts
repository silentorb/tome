export interface SchemaQueryTypeTable {
  id: string;
  title: string;
  memberCount?: number;
}

export interface SchemaQueryRelationshipRule {
  id: string;
  sourceTypeId: string;
  type: string;
  allowedTargetTypeIds: string[];
}

export interface SchemaQueryRelationColumnEdge {
  id: string;
  sourceTypeId: string;
  targetTypeId: string;
  label: string;
}

export interface ExtensionSchemaQueryServices {
  listTypeTables(): SchemaQueryTypeTable[] | Promise<SchemaQueryTypeTable[]>;
  listRelationshipRules(): SchemaQueryRelationshipRule[] | Promise<SchemaQueryRelationshipRule[]>;
  listRelationColumnEdges(): SchemaQueryRelationColumnEdge[] | Promise<SchemaQueryRelationColumnEdge[]>;
}
