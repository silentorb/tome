import type { GraphDatabase } from "../graph";
import {
  DEFAULT_CUSTOM_TAB,
  type ViewDefinition,
  type ViewsFile,
} from "../content/views-file";
import {
  generatedViewForRelationship,
  viewDefinitionsForTabs,
  viewsForRelationship,
} from "./index";
import { loadViewsFromContent } from "./load";
import type { ResolvedTab, TableTabsDetail } from "./tabs";

export const MEMBERS_RELATIONSHIP_TYPE = "members";

/** @deprecated Use MEMBERS_RELATIONSHIP_TYPE */
export const MEMBERS_SECTION_KEY = MEMBERS_RELATIONSHIP_TYPE;

/** @deprecated Use MEMBERS_RELATIONSHIP_TYPE */
export const ITEMS_SECTION_KEY = MEMBERS_RELATIONSHIP_TYPE;

export interface ResolvedCustomTabs {
  kind: "custom";
  items: ResolvedTab[];
  activeTabId: string;
  activeDefinition: Pick<ViewDefinition, "id" | "name" | "sorts">;
  definitions: Pick<ViewDefinition, "id" | "name" | "sorts">[];
}

function resolveActiveTabId(
  tabs: Pick<ViewDefinition, "id" | "name" | "sorts">[],
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
  relationshipType: string,
): { kind: "generated"; provider: string } | { kind: "custom"; definitions: Pick<ViewDefinition, "id" | "name" | "sorts">[] } | null {
  const generated = generatedViewForRelationship(views, nodeId, relationshipType);
  if (generated) {
    return { kind: "generated", provider: generated.generator };
  }
  const definitions = viewsForRelationship(views, nodeId, relationshipType);
  if (definitions.length === 0) return null;
  return { kind: "custom", definitions: viewDefinitionsForTabs(definitions) };
}

export function resolveCustomTabs(
  views: ViewsFile,
  nodeId: string,
  relationshipType: string,
  requestedTabId?: string,
): ResolvedCustomTabs {
  const viewRecords = viewsForRelationship(views, nodeId, relationshipType);
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
  relationshipType: string = MEMBERS_RELATIONSHIP_TYPE,
): boolean {
  return generatedViewForRelationship(views, nodeId, relationshipType) !== null;
}

export function generatedProviderId(
  views: ViewsFile,
  nodeId: string,
  relationshipType: string = MEMBERS_RELATIONSHIP_TYPE,
): string | null {
  return generatedViewForRelationship(views, nodeId, relationshipType)?.generator ?? null;
}

export function loadSectionTabsConfig(
  contentDir: string,
  nodeId: string,
  relationshipType: string = MEMBERS_RELATIONSHIP_TYPE,
): ReturnType<typeof getSectionTabsConfig> {
  const views = loadViewsFromContent(contentDir);
  return getSectionTabsConfig(views, nodeId, relationshipType);
}

export function resolveCustomTabsForNode(
  contentDir: string,
  nodeId: string,
  requestedTabId?: string,
  relationshipType: string = MEMBERS_RELATIONSHIP_TYPE,
): ResolvedCustomTabs {
  const views = loadViewsFromContent(contentDir);
  return resolveCustomTabs(views, nodeId, relationshipType, requestedTabId);
}

/** @deprecated Use resolveCustomTabs with views file. Kept for tests without content dir. */
export function buildCustomTabsDetail(
  definitions: Pick<ViewDefinition, "id" | "name" | "sorts">[],
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
  relationshipType: string = MEMBERS_RELATIONSHIP_TYPE,
): { provider: string } | null {
  const views = loadViewsFromContent(contentDir);
  const generated = generatedViewForRelationship(views, nodeId, relationshipType);
  if (generated) {
    return { provider: generated.generator };
  }
  return null;
}
