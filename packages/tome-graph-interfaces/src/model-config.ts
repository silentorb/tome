/** Display label for one relational role (string title or title + link flags). */
export type PerspectiveLabelConfig =
  | string
  | { title: string; linkAdd?: string; linkExisting?: boolean };

/** @deprecated Prefer RoleLabelConfig — alias during perspective→role terminology transition. */
export type RoleLabelConfig = PerspectiveLabelConfig;

export type PerspectivePair = [PerspectiveLabelConfig, PerspectiveLabelConfig];

/** Index-aligned label pair for the two relational roles of a relationship type. */
export type RoleLabelPair = PerspectivePair;

/** Canonical ULID identities for the two relational roles (parallel to label pair). */
export type RoleIdPair = [string, string];

export type TraitEntry = string | { key: string; [configKey: string]: unknown };

export interface RelationshipTypeDefinition {
  /**
   * User-facing labels for each relational role (endpoint 0/1).
   * On disk the preferred key is `roles` (legacy: `perspectives`).
   */
  perspectives: PerspectivePair;
  /**
   * Globally unique ULIDs for each relational role, index-aligned with `perspectives`.
   * Preferred on disk; when omitted, parsers/serializers bridge with deterministic ids.
   */
  roleIds?: RoleIdPair;
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
