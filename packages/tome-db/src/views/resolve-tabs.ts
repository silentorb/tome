import type { RelationshipReadStore } from "../graph-store/relationship-read";
import { readStoreGetNode, readStoreListNodeIds } from "../graph-store/relationship-read";
import {
  DEFAULT_CUSTOM_TAB,
  type ViewDefinition,
  type ViewsFile,
} from "tome-flatfile";
import {
  generatedViewForRelationship,
  viewDefinitionsForTabs,
  viewsForRelationship,
} from "./index";
import { loadViewsFromContent } from "tome-flatfile";
import type { ResolvedTab, TableTabsDetail } from "./tabs";

type TabDefinitionSummary = Pick<ViewDefinition, "id" | "name" | "sorts" | "properties">;

export interface ResolvedCustomTabs {
  kind: "custom";
  items: ResolvedTab[];
  activeTabId: string;
  activeDefinition: TabDefinitionSummary;
  definitions: TabDefinitionSummary[];
}

function resolveActiveTabId(
  tabs: TabDefinitionSummary[],
  requestedTabId?: string,
): string {
  if (requestedTabId && tabs.some((tab) => tab.id === requestedTabId)) {
    return requestedTabId;
  }
  return tabs[0]!.id;
}

/** @deprecated Use generatedViewForRelationship */
export function getSectionTabsConfig(
  views: ViewsFile,
  nodeId: string,
  association: string,
): { kind: "generated"; provider: string } | { kind: "custom"; definitions: TabDefinitionSummary[] } | null {
  const generated = generatedViewForRelationship(views, nodeId, association);
  if (generated) {
    return { kind: "generated", provider: generated.generator };
  }
  const definitions = viewsForRelationship(views, nodeId, association);
  if (definitions.length === 0) return null;
  return { kind: "custom", definitions: viewDefinitionsForTabs(definitions) };
}

export function resolveCustomTabs(
  views: ViewsFile,
  nodeId: string,
  association: string,
  requestedTabId?: string,
): ResolvedCustomTabs {
  const viewRecords = viewsForRelationship(views, nodeId, association);
  const definitions =
    viewRecords.length > 0 ? viewDefinitionsForTabs(viewRecords) : [DEFAULT_CUSTOM_TAB];
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
  association: string,
): boolean {
  return generatedViewForRelationship(views, nodeId, association) !== null;
}

export function generatedProviderId(
  views: ViewsFile,
  nodeId: string,
  association: string,
): string | null {
  return generatedViewForRelationship(views, nodeId, association)?.generator ?? null;
}

export function loadSectionTabsConfig(
  contentDir: string,
  nodeId: string,
  association: string,
): ReturnType<typeof getSectionTabsConfig> {
  const views = loadViewsFromContent(contentDir);
  return getSectionTabsConfig(views, nodeId, association);
}

export function resolveCustomTabsForNode(
  contentDir: string,
  nodeId: string,
  requestedTabId: string | undefined,
  association: string,
): ResolvedCustomTabs {
  const views = loadViewsFromContent(contentDir);
  return resolveCustomTabs(views, nodeId, association, requestedTabId);
}

/** @deprecated Use resolveCustomTabs with views file. Kept for tests without content dir. */
export function buildCustomTabsDetail(
  definitions: TabDefinitionSummary[],
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
  db: RelationshipReadStore,
  contentDir: string,
  nodeId: string,
  association: string,
): { provider: string } | null {
  const views = loadViewsFromContent(contentDir);
  const generated = generatedViewForRelationship(views, nodeId, association);
  if (generated) {
    return { provider: generated.generator };
  }
  return null;
}
