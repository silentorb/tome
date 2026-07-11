import type {
  SiteNode,
  StaticDatabaseSection,
  StaticNodeSection,
  StaticOrderedCollectionSection,
  TabItemsPayload,
} from "./site-types";

export function resolveActiveTabId(node: SiteNode, tabId?: string): string {
  if (node.itemsTabs) {
    if (tabId && node.itemsTabs.items.some((tab) => tab.id === tabId)) {
      return tabId;
    }
    return node.itemsTabs.defaultTabId;
  }
  return tabId ?? "";
}

export function buildSectionsForTab(
  node: SiteNode,
  activeTabId: string,
  tabPayload?: TabItemsPayload,
): StaticNodeSection[] {
  if (!tabPayload) {
    return node.sections;
  }

  return node.sections.map((section) => {
    if (section.type === "database" && tabPayload.kind === "database") {
      return {
        type: "database",
        databaseView: {
          ...section.databaseView,
          columns: tabPayload.databaseView.columns,
          rows: tabPayload.databaseView.rows,
          columnDefs: tabPayload.databaseView.columnDefs,
          tabs: {
            ...section.databaseView.tabs,
            activeTabId,
          },
        },
        defaultSort: tabPayload.defaultSort,
      } satisfies StaticDatabaseSection;
    }
    if (section.type === "ordered-collection" && tabPayload.kind === "ordered-collection") {
      return {
        type: "ordered-collection",
        configId: section.configId,
        view: {
          ...tabPayload.view,
          tabs: {
            ...tabPayload.view.tabs,
            activeTabId,
          },
        },
        defaultSort: tabPayload.defaultSort,
      } satisfies StaticOrderedCollectionSection;
    }
    return section;
  });
}
