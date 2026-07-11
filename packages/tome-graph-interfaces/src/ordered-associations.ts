import type { DatabaseColumnDef } from "./database-view";
import type { RelationLink } from "./relation-link";
import type { TableTabsDetail } from "./views";

export interface OrderedAssociationConfig {
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

export interface OrderedAssociationsFile {
  version: number;
  configs: OrderedAssociationConfig[];
}

export interface OrderedAssociationScope {
  id: string;
  name: string;
}

export interface OrderedAssociationRow {
  /** Member node id in the type database (e.g. a scene). */
  sceneId: string;
  name: string;
  cells: Record<string, string>;
  relationCells?: Record<string, RelationLink[]>;
}

export interface OrderedAssociationGroup {
  groupId: string;
  title: string;
  rows: OrderedAssociationRow[];
}

export interface OrderedAssociationViewDetail {
  configId: string;
  typeDatabaseId: string;
  typeDatabaseTitle: string;
  /** Set-side perspective = views.json relationshipType / section key. */
  viewRelationshipType: string;
  /** Member-side perspective for unlink/move against this set. */
  memberSidePerspective: string;
  tabs: TableTabsDetail;
  groups: OrderedAssociationGroup[];
  columns: string[];
  columnDefs?: DatabaseColumnDef[];
}

export interface OrderedAssociationMoveParams {
  scopeId: string;
  sceneId: string;
  targetGroupId: string;
  targetIndex: number;
}
