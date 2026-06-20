import type {
  DatabaseColumnDef,
  DatabaseRow,
  DatabaseViewDetail,
  NodePageMetadata,
  OrderedAssociationViewDetail,
  PropertiesSection,
  RelationTableSection,
  ResolvedTab,
} from "tome-db";

export interface TableSortSpec {
  orderBy: { column: string; direction: "asc" | "desc" }[];
}

export interface ItemsTabsMeta {
  items: ResolvedTab[];
  defaultTabId: string;
  sectionKind: "database" | "ordered-association";
  configId?: string;
  databaseId?: string;
}

export interface StaticDatabaseSection {
  type: "database";
  databaseView: DatabaseViewDetail;
  defaultSort?: TableSortSpec;
}

export interface StaticOrderedAssociationSection {
  type: "ordered-association";
  configId: string;
  view: OrderedAssociationViewDetail;
  defaultSort?: TableSortSpec;
}

export type StaticNodeSection =
  | StaticDatabaseSection
  | StaticOrderedAssociationSection
  | RelationTableSection;

export interface SiteNode {
  id: string;
  title: string;
  archived: boolean;
  primaryTypeTitle?: string;
  metadata: NodePageMetadata;
  properties: PropertiesSection | null;
  body: string;
  sections: StaticNodeSection[];
  itemsTabs?: ItemsTabsMeta;
}

export interface DatabaseTabPayload {
  kind: "database";
  databaseView: Pick<DatabaseViewDetail, "id" | "title" | "columns" | "rows" | "columnDefs">;
  defaultSort?: TableSortSpec;
}

export interface OrderedAssociationTabPayload {
  kind: "ordered-association";
  configId: string;
  view: OrderedAssociationViewDetail;
  defaultSort?: TableSortSpec;
}

export type TabItemsPayload = DatabaseTabPayload | OrderedAssociationTabPayload;

export interface TabRoute {
  nodeId: string;
  tabId: string;
}

export interface SiteData {
  homeNodeId: string;
  staticSiteHeader: string;
  base: string;
  nodes: SiteNode[];
  tabItemsPayloads: Record<string, TabItemsPayload>;
  tabRoutes: TabRoute[];
}

export type { DatabaseColumnDef, DatabaseRow };
