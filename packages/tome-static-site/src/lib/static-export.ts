import type { GraphDatabase, CustomTabDefinition, SchemaFile } from "tome-db";
import {
  getDatabaseViewDetail,
  getNodePageDetail,
  getOrderedAssociationView,
  type NodePageDetail,
  type NodeSection,
} from "tome-db";
import {
  type DatabaseTabPayload,
  type ItemsTabsMeta,
  type OrderedAssociationTabPayload,
  type SiteNode,
  type StaticNodeSection,
  type TabItemsPayload,
  type TabRoute,
} from "./site-types";
import { viewSortsToTableSort } from "./table-sort";

export function tabPayloadKey(nodeId: string, tabId: string): string {
  return `${nodeId.toLowerCase()}:${tabId}`;
}

function defaultSortForTab(
  customDefinitions: CustomTabDefinition[] | undefined,
  tabId: string,
) {
  const tab = customDefinitions?.find((definition) => definition.id === tabId);
  return tab?.sorts?.length ? viewSortsToTableSort(tab.sorts) : undefined;
}

function findItemsSection(
  sections: NodeSection[],
): Extract<NodeSection, { type: "database" } | { type: "ordered-association" }> | null {
  for (const section of sections) {
    if (section.type === "database" || section.type === "ordered-association") {
      return section;
    }
  }
  return null;
}

function toStaticSections(
  detail: NodePageDetail,
): StaticNodeSection[] {
  const out: StaticNodeSection[] = [];
  for (const section of detail.sections) {
    if (section.type === "markdown") continue;
    if (section.type === "database") {
      out.push({
        type: "database",
        databaseView: section.databaseView,
        defaultSort: defaultSortForTab(
          section.databaseView.tabs.customDefinitions,
          section.databaseView.tabs.activeTabId,
        ),
      });
      continue;
    }
    if (section.type === "ordered-association") {
      out.push({
        type: "ordered-association",
        configId: section.configId,
        view: section.view,
        defaultSort: defaultSortForTab(
          section.view.tabs.customDefinitions,
          section.view.tabs.activeTabId,
        ),
      });
      continue;
    }
    out.push(section);
  }
  return out;
}

function buildItemsTabsMeta(
  itemsSection: Extract<NodeSection, { type: "database" } | { type: "ordered-association" }>,
): ItemsTabsMeta {
  if (itemsSection.type === "database") {
    const { tabs, id } = itemsSection.databaseView;
    return {
      items: tabs.items,
      defaultTabId: tabs.activeTabId,
      sectionKind: "database",
      databaseId: id,
    };
  }
  return {
    items: itemsSection.view.tabs.items,
    defaultTabId: itemsSection.view.tabs.activeTabId,
    sectionKind: "ordered-association",
    configId: itemsSection.configId,
    databaseId: itemsSection.view.typeDatabaseId,
  };
}

function buildExtraTabPayload(
  db: GraphDatabase,
  nodeId: string,
  itemsTabs: ItemsTabsMeta,
  tabId: string,
  contentDir: string,
): TabItemsPayload | null {
  if (itemsTabs.sectionKind === "database") {
    const databaseView = getDatabaseViewDetail(db, nodeId, tabId, contentDir);
    if (!databaseView) return null;
    return {
      kind: "database",
      databaseView: {
        id: databaseView.id,
        title: databaseView.title,
        columns: databaseView.columns,
        rows: databaseView.rows,
        columnDefs: databaseView.columnDefs,
      },
      defaultSort: defaultSortForTab(databaseView.tabs.customDefinitions, tabId),
    } satisfies DatabaseTabPayload;
  }
  const configId = itemsTabs.configId;
  if (!configId) return null;
  const view = getOrderedAssociationView(db, configId, tabId, contentDir);
  if (!view) return null;
  return {
    kind: "ordered-association",
    configId,
    view,
    defaultSort: defaultSortForTab(view.tabs.customDefinitions, tabId),
  } satisfies OrderedAssociationTabPayload;
}

export function buildSiteNode(
  db: GraphDatabase,
  id: string,
  contentDir: string,
  schema: SchemaFile,
): SiteNode | null {
  const detail = getNodePageDetail(db, id, { contentDir, schema });
  if (!detail) return null;

  const itemsSection = findItemsSection(detail.sections);
  const itemsTabs =
    detail.isTypeTable && itemsSection && itemsSection.type === "database"
      ? buildItemsTabsMeta(itemsSection)
      : detail.isTypeTable && itemsSection && itemsSection.type === "ordered-association"
        ? buildItemsTabsMeta(itemsSection)
        : undefined;

  const multiTab = itemsTabs !== undefined && itemsTabs.items.length > 1;

  return {
    id: detail.id,
    title: detail.title,
    archived: detail.archived,
    primaryTypeTitle: detail.primaryTypeTitle,
    metadata: detail.metadata,
    properties: detail.properties,
    body: detail.body,
    sections: toStaticSections(detail),
    itemsTabs: multiTab ? itemsTabs : undefined,
  };
}

export function buildExtraTabPayloadsAndRoutes(
  db: GraphDatabase,
  nodes: SiteNode[],
  contentDir: string,
): { tabItemsPayloads: Record<string, TabItemsPayload>; tabRoutes: TabRoute[] } {
  const tabItemsPayloads: Record<string, TabItemsPayload> = {};
  const tabRoutes: TabRoute[] = [];

  for (const node of nodes) {
    if (!node.itemsTabs) continue;
    const { items, defaultTabId } = node.itemsTabs;
    for (const tab of items) {
      if (tab.id === defaultTabId) continue;
      const payload = buildExtraTabPayload(db, node.id, node.itemsTabs, tab.id, contentDir);
      if (!payload) continue;
      const key = tabPayloadKey(node.id, tab.id);
      tabItemsPayloads[key] = payload;
      tabRoutes.push({ nodeId: node.id, tabId: tab.id });
    }
  }

  return { tabItemsPayloads, tabRoutes };
}
