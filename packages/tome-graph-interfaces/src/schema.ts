export interface RelationshipRuleEntry {
  id: string;
  sourceTypeId: string;
  type: string;
  allowedTargetTypeIds: string[];
}

export type EnumDefaultOrder = "asc" | "desc";

export interface EnumDefinition {
  options: string[];
  default: string;
  /** Dropdown display order (UI only); defaults to asc when omitted in schema.json. */
  defaultOrder: EnumDefaultOrder;
  values?: Record<string, number>;
}

export interface SchemaFile {
  version: number;
  relationshipRules: RelationshipRuleEntry[];
  enums: Record<string, EnumDefinition>;
}
