import type { DatabaseRow } from "./database-view";

/** Synthetic group id for members with no group association. */
export const UNASSIGNED_GROUP_ID = "__unassigned__";

export interface RelationScopeLayerConfig {
  memberToScopeComposite: string;
  excludeColumnKeys?: string[];
}

export interface RelationGroupsLayerConfig {
  memberToGroupComposite: string;
  groupTypeDatabaseId: string;
  /** When set with an active scope, only groups linked to that scope appear. */
  groupToScopeComposite?: string;
  unassignedGroupTitle: string;
  /** Match group by title when import created duplicate group nodes. */
  canonicalGroupByTitle?: boolean;
  excludeColumnKeys?: string[];
}

export interface ReorderLayerConfig {
  excludeColumnKeys?: string[];
}

/**
 * Composable table presentation for a type-table Items section.
 * Layers are independent: scope tabs, relation groups, and reorder may each be absent.
 */
export interface TablePresentationComposition {
  id: string;
  typeDatabaseId: string;
  scope?: RelationScopeLayerConfig;
  groups?: RelationGroupsLayerConfig;
  reorder?: ReorderLayerConfig;
  /** Extra column keys hidden for this composition (e.g. deprecated status). */
  excludeColumnKeys?: string[];
  /** @deprecated Legacy column view name; ignored when properties come from views.json. */
  columnViewName?: string;
}

export interface TablePresentationFile {
  version: number;
  compositions: TablePresentationComposition[];
}

export interface RelationScopeTab {
  id: string;
  name: string;
}

export interface DatabaseRowGroup {
  groupId: string;
  title: string;
  rows: DatabaseRow[];
}

/** Presentation metadata the editor needs for add-row and cross-group drag. */
export interface DatabaseViewPresentation {
  compositionId: string;
  /** Active scope node id when a relation-scope layer is present. */
  scopeId?: string;
  /** Member→scope projection type for create/link. */
  scopeRelationType?: string;
  /** Member→group projection type for create/link. */
  groupRelationType?: string;
  /** Group composite association id (for unlink-by-composite). */
  groupCompositeType?: string;
  reorderable?: boolean;
}

export interface ReorderDatabaseMembersParams {
  orderedMemberIds: string[];
  /** Active scope/custom tab id so the returned view matches the editor. */
  tabId?: string;
  /** When set, also move this member's group relation after rewriting order. */
  groupChange?: {
    memberId: string;
    targetGroupId: string;
  };
}
