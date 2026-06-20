import type { ContentStore } from "../content/store";
import {
  emptyViewsFile,
  slugifyTabId,
  uniqueTabId,
  DEFAULT_CUSTOM_TAB,
  type CustomTabDefinition,
  type ViewSortSpec,
  type ViewsFile,
} from "../content/views-file";
import { ITEMS_SECTION_KEY } from "./resolve-tabs";

export type ViewsMutationError =
  | "node_not_found"
  | "section_not_found"
  | "tab_not_found"
  | "last_tab"
  | "invalid_name"
  | "invalid_tab_order"
  | "not_custom_tabs";

function ensureCustomSection(
  file: ViewsFile,
  nodeId: string,
  sectionKey: string,
): CustomTabDefinition[] {
  const node = file.nodes[nodeId];
  const section = node?.sections[sectionKey];
  if (!section || section.tabs.kind !== "custom") {
    throw new Error("not_custom_tabs");
  }
  return section.tabs.definitions;
}

function writeViews(store: ContentStore, file: ViewsFile): void {
  store.writeViewsFile(file);
}

export function getNodeViews(store: ContentStore, nodeId: string): ViewsFile["nodes"][string] | null {
  const file = store.readViewsFile();
  return file.nodes[nodeId] ?? null;
}

export function createTab(
  store: ContentStore,
  nodeId: string,
  sectionKey: string,
  input: { name: string; sorts?: ViewSortSpec[] },
): CustomTabDefinition {
  const trimmed = input.name.trim();
  if (!trimmed) throw new Error("invalid_name");

  const file = store.readViewsFile();
  let node = file.nodes[nodeId];
  if (!node) {
    node = { sections: {} };
    file.nodes[nodeId] = node;
  }

  let definitions: CustomTabDefinition[];
  const existing = node.sections[sectionKey];
  if (existing?.tabs.kind === "custom") {
    definitions = existing.tabs.definitions;
  } else {
    definitions = [];
    node.sections[sectionKey] = { tabs: { kind: "custom", definitions } };
  }

  const existingIds = new Set(definitions.map((tab) => tab.id));
  const id = uniqueTabId(slugifyTabId(trimmed), existingIds);
  const tab: CustomTabDefinition = {
    id,
    name: trimmed,
    sorts: input.sorts ?? [{ column: "name", direction: "asc" }],
  };
  definitions.push(tab);
  writeViews(store, file);
  return tab;
}

export function updateTab(
  store: ContentStore,
  nodeId: string,
  sectionKey: string,
  tabId: string,
  input: { name?: string; sorts?: ViewSortSpec[] },
): CustomTabDefinition {
  const file = store.readViewsFile();
  const definitions = ensureCustomSection(file, nodeId, sectionKey);
  const tab = definitions.find((entry) => entry.id === tabId);
  if (!tab) throw new Error("tab_not_found");

  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (!trimmed) throw new Error("invalid_name");
    tab.name = trimmed;
  }
  if (input.sorts !== undefined) {
    tab.sorts = input.sorts;
  }

  writeViews(store, file);
  return tab;
}

export function deleteTab(
  store: ContentStore,
  nodeId: string,
  sectionKey: string,
  tabId: string,
): void {
  const file = store.readViewsFile();
  const definitions = ensureCustomSection(file, nodeId, sectionKey);
  if (definitions.length <= 1) throw new Error("last_tab");

  const index = definitions.findIndex((entry) => entry.id === tabId);
  if (index < 0) throw new Error("tab_not_found");
  definitions.splice(index, 1);
  writeViews(store, file);
}

export function reorderSectionTabs(
  store: ContentStore,
  nodeId: string,
  sectionKey: string,
  tabIds: string[],
): CustomTabDefinition[] {
  if (!Array.isArray(tabIds) || tabIds.length === 0) {
    throw new Error("invalid_tab_order");
  }

  const file = store.readViewsFile();
  const definitions = ensureCustomSection(file, nodeId, sectionKey);
  if (tabIds.length !== definitions.length) {
    throw new Error("invalid_tab_order");
  }

  const byId = new Map(definitions.map((tab) => [tab.id, tab]));
  const reordered: CustomTabDefinition[] = [];
  for (const tabId of tabIds) {
    const tab = byId.get(tabId);
    if (!tab) throw new Error("invalid_tab_order");
    reordered.push(tab);
  }

  const section = file.nodes[nodeId]!.sections[sectionKey]!;
  section.tabs = { kind: "custom", definitions: reordered };
  writeViews(store, file);
  return reordered;
}

export function updateSectionColumnOrder(
  store: ContentStore,
  nodeId: string,
  sectionKey: string,
  columnOrder: string[],
): string[] {
  if (!Array.isArray(columnOrder) || columnOrder.length === 0) {
    throw new Error("invalid_column_order");
  }
  const normalized = columnOrder.map((key) => key.trim()).filter(Boolean);
  if (normalized.length === 0) throw new Error("invalid_column_order");

  const file = store.readViewsFile();
  let node = file.nodes[nodeId];
  if (!node) {
    node = { sections: {} };
    file.nodes[nodeId] = node;
  }

  let section = node.sections[sectionKey];
  if (!section) {
    section = { tabs: { kind: "custom", definitions: [DEFAULT_CUSTOM_TAB] } };
    node.sections[sectionKey] = section;
  }

  section.columnOrder = normalized;
  writeViews(store, file);
  return normalized;
}

export function ensureCustomItemsSection(
  store: ContentStore,
  nodeId: string,
  definitions: CustomTabDefinition[],
): void {
  const file = store.readViewsFile();
  file.nodes[nodeId] = {
    sections: {
      [ITEMS_SECTION_KEY]: {
        tabs: { kind: "custom", definitions },
      },
    },
  };
  writeViews(store, file);
}

export function ensureGeneratedItemsSection(
  store: ContentStore,
  nodeId: string,
  provider: string,
): void {
  const file = store.readViewsFile();
  file.nodes[nodeId] = {
    sections: {
      [ITEMS_SECTION_KEY]: {
        tabs: { kind: "generated", provider },
      },
    },
  };
  writeViews(store, file);
}

export function replaceViewsFile(store: ContentStore, file: ViewsFile): void {
  writeViews(store, file);
}

export function readViewsFileOrEmpty(store: ContentStore): ViewsFile {
  try {
    return store.readViewsFile();
  } catch {
    return emptyViewsFile();
  }
}

/** Remove a column key from section columnOrder and reset tab sorts that reference it. */
export function purgeColumnFromViews(
  store: ContentStore,
  nodeId: string,
  sectionKey: string,
  columnKey: string,
): void {
  const file = store.readViewsFile();
  const node = file.nodes[nodeId];
  if (!node) return;

  const section = node.sections[sectionKey];
  if (!section) return;

  if (section.columnOrder) {
    section.columnOrder = section.columnOrder.filter((key) => key !== columnKey);
    if (section.columnOrder.length === 0) {
      delete section.columnOrder;
    }
  }

  if (section.tabs.kind === "custom") {
    for (const tab of section.tabs.definitions) {
      if (tab.sorts.some((sort) => sort.column === columnKey)) {
        tab.sorts = [{ column: "name", direction: "asc" }];
      }
    }
  }

  writeViews(store, file);
}

/** Rename a column key in section columnOrder and tab sorts. */
export function renameColumnInViews(
  store: ContentStore,
  nodeId: string,
  sectionKey: string,
  oldKey: string,
  newKey: string,
): void {
  const file = store.readViewsFile();
  const node = file.nodes[nodeId];
  if (!node) return;

  const section = node.sections[sectionKey];
  if (!section) return;

  if (section.columnOrder) {
    section.columnOrder = section.columnOrder.map((key) => (key === oldKey ? newKey : key));
  }

  if (section.tabs.kind === "custom") {
    for (const tab of section.tabs.definitions) {
      for (const sort of tab.sorts) {
        if (sort.column === oldKey) {
          sort.column = newKey;
        }
      }
    }
  }

  writeViews(store, file);
}

/** Append a column key to section columnOrder when a section config exists. */
export function appendColumnToViewsOrder(
  store: ContentStore,
  nodeId: string,
  sectionKey: string,
  columnKey: string,
): void {
  const file = store.readViewsFile();
  const node = file.nodes[nodeId];
  if (!node) return;

  const section = node.sections[sectionKey];
  if (!section) return;

  const order = section.columnOrder ?? [];
  if (!order.includes(columnKey)) {
    section.columnOrder = [...order, columnKey];
    writeViews(store, file);
  }
}
