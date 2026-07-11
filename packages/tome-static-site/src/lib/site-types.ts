import type {
  DatabaseColumnDef,
  DatabaseRow,
  DatabaseViewDetail,
  NodePageMetadata,
  OrderedCollectionViewDetail,
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
  sectionKind: "database" | "ordered-collection";
  configId?: string;
  databaseId?: string;
}

export interface StaticDatabaseSection {
  type: "database";
  databaseView: DatabaseViewDetail;
  defaultSort?: TableSortSpec;
}

export interface StaticOrderedCollectionSection {
  type: "ordered-collection";
  configId: string;
  view: OrderedCollectionViewDetail;
  defaultSort?: TableSortSpec;
}

export type StaticNodeSection =
  | StaticDatabaseSection
  | StaticOrderedCollectionSection
  | RelationTableSection;

export interface SiteNode {
  id: string;
  title: string;
  archived: boolean;
  primaryTypeTitle?: string;
  /** Normalized alias from frontmatter; omitted when unset. */
  urlAlias?: string;
  /** Canonical static path segment(s): alias or lowercase node id. */
  urlPath: string;
  metadata: NodePageMetadata;
  properties: PropertiesSection | null;
  body: string;
  bodyHtml?: string;
  sections: StaticNodeSection[];
  itemsTabs?: ItemsTabsMeta;
}

export interface DatabaseTabPayload {
  kind: "database";
  databaseView: Pick<DatabaseViewDetail, "id" | "title" | "columns" | "rows" | "columnDefs">;
  defaultSort?: TableSortSpec;
}

export interface OrderedCollectionTabPayload {
  kind: "ordered-collection";
  configId: string;
  view: OrderedCollectionViewDetail;
  defaultSort?: TableSortSpec;
}

export type TabItemsPayload = DatabaseTabPayload | OrderedCollectionTabPayload;

export interface TabRoute {
  nodeId: string;
  tabId: string;
}

export interface SiteData {
  homeNodeId: string;
  staticSiteHeader: string;
  /** Resolved footer text; omitted when footer branding is not configured. */
  staticSiteFooter?: string;
  base: string;
  nodes: SiteNode[];
  /** Lowercase node id → canonical url path segment(s). */
  pathById: Record<string, string>;
  /** Normalized alias → lowercase node id. */
  aliasToId: Record<string, string>;
  tabItemsPayloads: Record<string, TabItemsPayload>;
  tabRoutes: TabRoute[];
}

export type { DatabaseColumnDef, DatabaseRow };
