import type { DatabaseColumnDef, DatabaseViewDetail } from "./database-view";
import type { NodeBodyDocument } from "./node-body-document";
import type { NodeDetail } from "./queries";
import type { NodePageMetadata } from "./node-metadata";
import type { PropertiesSection } from "./node-type-properties";
import type { TableRowsWindow } from "./table-rows-window";

export interface MarkdownSection {
  type: "markdown";
  body: string;
}

/** Editor HTTP markdown section — body content lives in {@link EditorNodePageDetail.document}. */
export interface EditorMarkdownSection {
  type: "markdown";
}

export interface DatabaseTableSection {
  type: "database";
  databaseView: DatabaseViewDetail;
}

export interface RelationRow {
  targetId: string;
  name: string;
  cells: Record<string, string>;
}

export type RelationTableAddMode = "link-existing" | "none";

export interface RelationTableSection {
  type: "relations";
  label: string;
  title: string;
  /** When set, the section title links to this type node. */
  typeNodeId: string | null;
  /** UI hint: allowed target type ids for link-existing picker (from table-schemas or registry endpoints). */
  allowedTargetTypeIds?: string[];
  /** Inline table add control: link existing record vs none (registry linkExisting presentation). */
  addMode: RelationTableAddMode;
  /** Optional link-existing button label from association perspective config. */
  linkAddLabel?: string;
  columns: string[];
  columnDefs?: DatabaseColumnDef[];
  rows: RelationRow[];
  /** Window metadata for lazy-loaded / infinite-scroll fetches. */
  rowsWindow: TableRowsWindow;
}

export type NodeSection =
  | MarkdownSection
  | DatabaseTableSection
  | RelationTableSection;

export type EditorNodeSection =
  | EditorMarkdownSection
  | DatabaseTableSection
  | RelationTableSection;

export interface NodePageDetail extends NodeDetail {
  metadata: NodePageMetadata;
  properties: PropertiesSection | null;
  sections: NodeSection[];
}

/** Node page DTO for the editor HTTP use case (structured body document). */
export interface EditorNodePageDetail extends Omit<NodeDetail, "body"> {
  document: NodeBodyDocument;
  metadata: NodePageMetadata;
  properties: PropertiesSection | null;
  sections: EditorNodeSection[];
}

export type { PropertiesSection } from "./node-type-properties";
export type { NodeBacklink, NodePageMetadata } from "./node-metadata";
