import type { CustomTabDefinition, SchemaFile, RelationshipReadStore } from "tome-db";
import {
  getDatabaseViewDetail,
  getNodePageDetail,
  readStoreGetNode,
  type NodePageDetail,
  type NodeSection,
} from "tome-db";
import {
  type DatabaseTabPayload,
  type ItemsTabsMeta,
  type SiteNode,
  type StaticNodeSection,
  type TabItemsPayload,
  type TabRoute,
} from "./site-types";
import { readUrlAlias } from "./node-urls";
import { viewSortsToTableSort } from "./table-sort";

export function tabPayloadKey(nodeId: string, tabId: string): string {
  return `${nodeId}:${tabId}`;
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
): Extract<NodeSection, { type: "database" }> | null {
  for (const section of sections) {
    if (section.type === "database") return section;
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
    out.push(section);
  }
  return out;
}

function buildItemsTabsMeta(
  itemsSection: Extract<NodeSection, { type: "database" }>,
): ItemsTabsMeta {
  const { tabs, id } = itemsSection.databaseView;
  return {
    items: tabs.items,
    defaultTabId: tabs.activeTabId,
    databaseId: id,
  };
}

function buildExtraTabPayload(
  store: RelationshipReadStore,
  nodeId: string,
  tabId: string,
  contentDir: string,
): TabItemsPayload | null {
  const databaseView = getDatabaseViewDetail(store, nodeId, tabId, contentDir);
  if (!databaseView) return null;
  return {
    kind: "database",
    databaseView: {
      id: databaseView.id,
      title: databaseView.title,
      columns: databaseView.columns,
      rows: databaseView.rows,
      columnDefs: databaseView.columnDefs,
      groups: databaseView.groups,
    },
    defaultSort: defaultSortForTab(databaseView.tabs.customDefinitions, tabId),
  } satisfies DatabaseTabPayload;
}

export function buildSiteNode(
  store: RelationshipReadStore,
  id: string,
  contentDir: string,
  schema: SchemaFile,
): SiteNode | null {
  const detail = getNodePageDetail(store, id, { contentDir });
  if (!detail) return null;

  const itemsSection = findItemsSection(detail.sections);
  const itemsTabs =
    detail.isTypeTable && itemsSection ? buildItemsTabsMeta(itemsSection) : undefined;

  const multiTab = itemsTabs !== undefined && itemsTabs.items.length > 1;
  const urlAlias = readUrlAlias(readStoreGetNode(store, id)?.properties ?? null) ?? undefined;

  return {
    id: detail.id,
    title: detail.title,
    archived: detail.archived,
    primaryTypeTitle: detail.primaryTypeTitle,
    urlAlias,
    urlPath: urlAlias ?? detail.id,
    metadata: detail.metadata,
    properties: detail.properties,
    body: detail.body,
    sections: toStaticSections(detail),
    itemsTabs: multiTab ? itemsTabs : undefined,
  };
}

export function buildExtraTabPayloadsAndRoutes(
  store: RelationshipReadStore,
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
      const payload = buildExtraTabPayload(store, node.id, tab.id, contentDir);
      if (!payload) continue;
      const key = tabPayloadKey(node.id, tab.id);
      tabItemsPayloads[key] = payload;
      tabRoutes.push({ nodeId: node.id, tabId: tab.id });
    }
  }

  return { tabItemsPayloads, tabRoutes };
}
