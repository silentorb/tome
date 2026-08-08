import type { RelationLink } from "./relation-link";
import type { TableRowsWindow } from "./table-rows-window";
import type {
  DatabaseRowGroup,
  DatabaseViewPresentation,
} from "./table-presentation";
import type { TableTabsDetail } from "./views";

export interface DatabaseRow {
  rowIndex: number;
  nodeId: string;
  name: string;
  cells: Record<string, string>;
  relationCells?: Record<string, RelationLink[]>;
}

export interface DatabaseColumnDef {
  key: string;
  name: string;
  type: string;
  source?: "stored" | "dynamic";
  /** Workspace enum id when type is `enum` (e.g. priority). */
  enumId?: string;
  /** Allowed enum labels for dropdowns (stored values, not weights). */
  options?: string[];
  /** Default enum label when the stored value is unset. */
  defaultValue?: string;
  /** Dropdown display order for enum options (UI only; storage uses canonical options order). */
  defaultOrder?: "asc" | "desc";
  /** Graph relationship perspective when type is `relation`. */
  relationType?: string;
  /** Storage composite from associations.json when type is `relation`. */
  relationshipCompositeType?: string;
  /** @deprecated Use relationshipCompositeType + registry endpoints. */
  targetDatabaseId?: string;
}

export interface DatabaseViewDetail {
  id: string;
  title: string;
  /** @deprecated Use tabs.activeTabId and active tab label from tabs.items */
  view: string;
  /** @deprecated Use tabs.items */
  views: string[];
  tabs: TableTabsDetail;
  /** Set-trait association ULID from views.json. */
  viewAssociation: string;
  /** Member-side projection type (`ULID:1`) for unlink/move against this set. */
  memberSidePerspective: string;
  /** Section heading from association perspective labels, else "Contents". */
  sectionTitle: string;
  /** Ordered data column keys before per-view visibility filtering. */
  allColumns: string[];
  columns: string[];
  rows: DatabaseRow[];
  /** Window metadata for lazy-loaded / infinite-scroll fetches. */
  rowsWindow: TableRowsWindow;
  /** Column defs for visible columns only. */
  columnDefs?: DatabaseColumnDef[];
  /** Ordered column defs before per-view visibility filtering. */
  allColumnDefs?: DatabaseColumnDef[];
  /**
   * When a relation-groups presentation layer is active, rows are partitioned into
   * subsections. Top-level `rows` remains the flat windowed sequence (same order).
   */
  groups?: DatabaseRowGroup[];
  /** Metadata for scope/group/reorder presentation layers (add-row, DnD). */
  presentation?: DatabaseViewPresentation;
}
