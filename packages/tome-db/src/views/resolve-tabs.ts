import type { GraphDatabase } from "../graph";
import {
  DEFAULT_CUSTOM_TAB,
  type CustomTabDefinition,
  type SectionTabsConfig,
  type ViewsFile,
} from "../content/views-file";
import { loadViewsFromContent } from "./load";
import type { ResolvedTab, TableTabsDetail } from "./tabs";

export const ITEMS_SECTION_KEY = "items";

export interface ResolvedCustomTabs {
  kind: "custom";
  items: ResolvedTab[];
  activeTabId: string;
  activeDefinition: CustomTabDefinition;
  definitions: CustomTabDefinition[];
}

function resolveActiveTabId(
  tabs: CustomTabDefinition[],
  requestedTabId?: string,
): string {
  if (requestedTabId && tabs.some((tab) => tab.id === requestedTabId)) {
    return requestedTabId;
  }
  return tabs[0]!.id;
}

export function getSectionTabsConfig(
  views: ViewsFile,
  nodeId: string,
  sectionKey: string,
): SectionTabsConfig | null {
  return views.nodes[nodeId]?.sections[sectionKey]?.tabs ?? null;
}

export function resolveCustomTabs(
  views: ViewsFile,
  nodeId: string,
  sectionKey: string,
  requestedTabId?: string,
): ResolvedCustomTabs {
  const config = getSectionTabsConfig(views, nodeId, sectionKey);
  const definitions =
    config?.kind === "custom" ? config.definitions : [DEFAULT_CUSTOM_TAB];
  const activeTabId = resolveActiveTabId(definitions, requestedTabId);
  const activeDefinition =
    definitions.find((tab) => tab.id === activeTabId) ?? definitions[0]!;
  const items: ResolvedTab[] = definitions.map((tab) => ({
    id: tab.id,
    label: tab.name,
    kind: "custom" as const,
  }));
  return {
    kind: "custom",
    items,
    activeTabId,
    activeDefinition,
    definitions,
  };
}

export function resolveGeneratedTabsFromScopes(
  scopes: { id: string; name: string }[],
  requestedTabId?: string,
): TableTabsDetail {
  const items: ResolvedTab[] = scopes.map((scope) => ({
    id: scope.id,
    label: scope.name,
    kind: "generated",
  }));
  const activeTabId =
    requestedTabId && scopes.some((scope) => scope.id === requestedTabId)
      ? requestedTabId
      : (scopes[0]?.id ?? "");
  return { kind: "generated", items, activeTabId };
}

export function isGeneratedSection(
  views: ViewsFile,
  nodeId: string,
  sectionKey: string = ITEMS_SECTION_KEY,
): boolean {
  const config = getSectionTabsConfig(views, nodeId, sectionKey);
  return config?.kind === "generated";
}

export function generatedProviderId(
  views: ViewsFile,
  nodeId: string,
  sectionKey: string = ITEMS_SECTION_KEY,
): string | null {
  const config = getSectionTabsConfig(views, nodeId, sectionKey);
  return config?.kind === "generated" ? config.provider : null;
}

export function loadSectionTabsConfig(
  contentDir: string,
  nodeId: string,
  sectionKey: string = ITEMS_SECTION_KEY,
): SectionTabsConfig | null {
  const views = loadViewsFromContent(contentDir);
  return getSectionTabsConfig(views, nodeId, sectionKey);
}

export function resolveCustomTabsForNode(
  contentDir: string,
  nodeId: string,
  requestedTabId?: string,
  sectionKey: string = ITEMS_SECTION_KEY,
): ResolvedCustomTabs {
  const views = loadViewsFromContent(contentDir);
  return resolveCustomTabs(views, nodeId, sectionKey, requestedTabId);
}

/** @deprecated Use resolveCustomTabs with views file. Kept for tests without content dir. */
export function buildCustomTabsDetail(
  definitions: CustomTabDefinition[],
  requestedTabId?: string,
): ResolvedCustomTabs {
  const activeTabId = resolveActiveTabId(definitions, requestedTabId);
  const activeDefinition =
    definitions.find((tab) => tab.id === activeTabId) ?? definitions[0]!;
  return {
    kind: "custom",
    items: definitions.map((tab) => ({
      id: tab.id,
      label: tab.name,
      kind: "custom",
    })),
    activeTabId,
    activeDefinition,
    definitions,
  };
}

export function activeTabName(resolved: ResolvedCustomTabs): string {
  return resolved.activeDefinition.name;
}

export function sectionUsesGeneratedTabs(
  db: GraphDatabase,
  contentDir: string,
  nodeId: string,
  sectionKey: string = ITEMS_SECTION_KEY,
): { provider: string } | null {
  const views = loadViewsFromContent(contentDir);
  const config = getSectionTabsConfig(views, nodeId, sectionKey);
  if (config?.kind === "generated") {
    return { provider: config.provider };
  }
  return null;
}
