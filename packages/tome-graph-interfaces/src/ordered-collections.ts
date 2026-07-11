import type { DatabaseColumnDef } from "./database-view";
import type { RelationLink } from "./relation-link";
import type { TableTabsDetail } from "./views";

export interface OrderedCollectionConfig {
  id: string;
  typeDatabaseId: string;
  /** Composite relationship type for member ↔ scope tabs (e.g. scenes_product). */
  scopeCompositeType: string;
  /** Composite relationship type for member ↔ group subsection (e.g. scenes_part). */
  groupCompositeType: string;
  /** Composite relationship type linking group nodes to scope (e.g. products_parts_database). */
  partProductCompositeType: string;
  groupTypeDatabaseId: string;
  unassignedGroupTitle: string;
  /** Reference view name used internally for column visibility (no view tabs in UI). */
  columnViewName?: string;
  /** Slugified column keys excluded from table columns (UI-redundant or deprecated). */
  excludedColumnKeys?: string[];
}

export interface OrderedCollectionsFile {
  version: number;
  configs: OrderedCollectionConfig[];
}

export interface OrderedCollectionScope {
  id: string;
  name: string;
}

export interface OrderedCollectionRow {
  /** Member node id in the type database (e.g. a scene). */
  sceneId: string;
  name: string;
  cells: Record<string, string>;
  relationCells?: Record<string, RelationLink[]>;
}

export interface OrderedCollectionGroup {
  groupId: string;
  title: string;
  rows: OrderedCollectionRow[];
}

export interface OrderedCollectionViewDetail {
  configId: string;
  typeDatabaseId: string;
  typeDatabaseTitle: string;
  /** Set-side perspective = views.json association / section key. */
  viewAssociation: string;
  /** Member-side perspective for unlink/move against this set. */
  memberSidePerspective: string;
  tabs: TableTabsDetail;
  groups: OrderedCollectionGroup[];
  columns: string[];
  columnDefs?: DatabaseColumnDef[];
}

export interface OrderedCollectionMoveParams {
  scopeId: string;
  sceneId: string;
  targetGroupId: string;
  targetIndex: number;
}
