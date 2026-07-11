import type { DatabaseColumnDef, DatabaseViewDetail } from "./database-view";
import type { NodeDetail } from "./queries";
import type { NodePageMetadata } from "./node-metadata";
import type { PropertiesSection } from "./node-type-properties";
import type { OrderedAssociationViewDetail } from "./ordered-associations";

export interface MarkdownSection {
  type: "markdown";
  body: string;
}

export interface DatabaseTableSection {
  type: "database";
  databaseView: DatabaseViewDetail;
}

export interface OrderedAssociationSection {
  type: "ordered-association";
  configId: string;
  view: OrderedAssociationViewDetail;
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
  /** Optional link-existing button label from relationship-types perspectiveLabels. */
  linkAddLabel?: string;
  columns: string[];
  columnDefs?: DatabaseColumnDef[];
  rows: RelationRow[];
}

export type NodeSection =
  | MarkdownSection
  | DatabaseTableSection
  | OrderedAssociationSection
  | RelationTableSection;

export interface NodePageDetail extends NodeDetail {
  metadata: NodePageMetadata;
  properties: PropertiesSection | null;
  sections: NodeSection[];
}

export type { PropertiesSection } from "./node-type-properties";
export type { NodeBacklink, NodePageMetadata } from "./node-metadata";
