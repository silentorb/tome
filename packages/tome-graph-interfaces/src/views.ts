export type ViewSortDirection = "asc" | "desc";

export interface ViewSortSpec {
  column: string;
  direction: ViewSortDirection;
}

export interface ViewProperties {
  columnOrder?: string[];
}

/** A static view definition for a node + relationship type pair. */
export interface ViewDefinition {
  id: string;
  nodeId: string;
  perspective: string;
  name: string;
  sorts: ViewSortSpec[];
  properties?: ViewProperties;
  /** Column keys hidden in this view only (not synced across sibling views). */
  hiddenColumns?: string[];
}

/** Generated views computed at runtime from a provider (e.g. scenes-by-book). */
export interface GeneratedViewRecord {
  nodeId: string;
  perspective: string;
  generator: string;
}

export type ViewRecord = ViewDefinition | GeneratedViewRecord;

/** @deprecated Use ViewDefinition */
export type CustomTabDefinition = Pick<ViewDefinition, "id" | "name" | "sorts" | "hiddenColumns">;

export interface ViewsFile {
  version: number;
  views: ViewRecord[];
}

export type TabKind = "custom" | "generated";

export interface ResolvedTab {
  id: string;
  label: string;
  kind: TabKind;
}

export interface TableTabsDetail {
  kind: TabKind;
  items: ResolvedTab[];
  activeTabId: string;
  /** Custom tab definitions when kind is custom (for tab CRUD UI). */
  customDefinitions?: CustomTabDefinition[];
}

export type ViewsMutationError =
  | "node_not_found"
  | "section_not_found"
  | "tab_not_found"
  | "view_not_found"
  | "last_tab"
  | "last_view"
  | "invalid_name"
  | "invalid_tab_order"
  | "invalid_view_order"
  | "not_custom_tabs"
  | "not_custom_views";
