import type { CustomTabDefinition } from "../content/views-file";

export type TabKind = "custom" | "generated";

export interface ResolvedTab {
  id: string;
  label: string;
  kind: TabKind;
}

export interface TableTabsDetail {
  kind: TabKind;
  items: ResolvedTab[];
  activeTabId: string;
  /** Custom tab definitions when kind is custom (for tab CRUD UI). */
  customDefinitions?: CustomTabDefinition[];
}
