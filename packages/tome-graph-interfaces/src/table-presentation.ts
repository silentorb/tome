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

/**
 * Pins an Items table to the intrinsic `ordered`-trait edge sequence and enables
 * row drag-and-drop when the UI supports it (edits edge `order`, not view sorts).
 */
export interface SequenceLayerConfig {
  excludeColumnKeys?: string[];
}

/**
 * Presentation layers stored on a generated `views.json` record.
 * At least one of `scope`, `groups`, or `sequence` must be present.
 */
export interface TablePresentationLayers {
  scope?: RelationScopeLayerConfig;
  groups?: RelationGroupsLayerConfig;
  sequence?: SequenceLayerConfig;
  /** Extra column keys hidden for this composition (e.g. deprecated status). */
  excludeColumnKeys?: string[];
}

/**
 * Runtime composition: layers plus identity synthesized from the generated view
 * (`id` / `typeDatabaseId` = type-table `nodeId`).
 */
export interface TablePresentationComposition extends TablePresentationLayers {
  id: string;
  typeDatabaseId: string;
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
  /** When true, rows follow intrinsic edge sequence and may be drag-edited. */
  sequenced?: boolean;
}

export interface RewriteDatabaseSequenceParams {
  orderedRowIds: string[];
  /** Active scope/custom tab id so the returned view matches the editor. */
  tabId?: string;
  /** When set, also move this row's group relation after rewriting sequence. */
  groupChange?: {
    rowId: string;
    targetGroupId: string;
  };
}
