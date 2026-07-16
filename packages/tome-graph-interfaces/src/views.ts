export type ViewSortDirection = "asc" | "desc";

export interface ViewSortSpec {
  column: string;
  direction: ViewSortDirection;
}

/** A static view definition for a node + set association pair. */
export interface ViewDefinition {
  id: string;
  nodeId: string;
  /** Set-trait association ULID (not a display label). */
  association: string;
  name: string;
  sorts: ViewSortSpec[];
  /**
   * Optional allowlist of visible column keys (order = display order).
   * Absent → all columns visible in default order.
   */
  properties?: string[];
}

/** Generated views computed at runtime from a provider (e.g. scenes-by-book). */
export interface GeneratedViewRecord {
  nodeId: string;
  /** Set-trait association ULID (not a display label). */
  association: string;
  generator: string;
  /**
   * Shared allowlist for all tabs produced by this generator.
   * Absent → all columns visible in default order.
   */
  properties?: string[];
}

export type ViewRecord = ViewDefinition | GeneratedViewRecord;

/** @deprecated Use ViewDefinition */
export type CustomTabDefinition = Pick<ViewDefinition, "id" | "name" | "sorts" | "properties">;

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
