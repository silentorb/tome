export type PerspectiveLabelConfig =
  | string
  | { title: string; linkAdd?: string; linkExisting?: boolean };

export type PerspectivePair = [PerspectiveLabelConfig, PerspectiveLabelConfig];

export type TraitEntry = string | { key: string; [configKey: string]: unknown };

export interface RelationshipTypeDefinition {
  perspectives: PerspectivePair;
  linkExisting?: boolean;
  traits?: TraitEntry[];
  endpoints?: {
    0: { typeId?: string };
    1: { typeId?: string };
  };
}

export interface RelationshipTypesFile {
  version: number;
  relationshipTypes: Record<string, RelationshipTypeDefinition>;
}

export interface DynamicPropertyFileEntry {
  id: string;
  owner: string;
  columnKey: string;
  columnName: string;
  columnType: string;
  resolverId: string;
  params?: Record<string, unknown>;
}

export interface DynamicColumnSetFileEntry {
  id: string;
  owner: string;
  columnKeyPattern: string;
  columnNamePattern: string;
  columnType: string;
  resolverId: string;
  params?: Record<string, unknown>;
}

export interface DynamicPropertiesFile {
  version: number;
  properties: DynamicPropertyFileEntry[];
  columnSets: DynamicColumnSetFileEntry[];
}
