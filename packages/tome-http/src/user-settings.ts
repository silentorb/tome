/** Local user preferences persisted outside git (see `.tome/user-settings.json`). */

export const USER_SETTINGS_VERSION = 1;

export type SortDirection = "asc" | "desc";

export interface SortColumn {
  column: string;
  direction: SortDirection;
}

/** SQL-style multi-column sort spec for a section table. */
export interface TableSortSpec {
  orderBy: SortColumn[];
}

export interface SidebarSettings {
  recentMaxItems?: number;
}

/** Timeline chrome overrides (sparse; omit defaults). */
export interface SequencingSettings {
  showDependencyEdges?: boolean;
}

/**
 * Relate/Move picker prefs (sparse).
 * `onlyActiveTargets` defaults to true — only persist `false`.
 */
export interface RelationshipsSettings {
  /** MRU-first directed projection types (`ULID:0` / `ULID:1`), max 10. */
  recentAssociationTypes?: string[];
  onlyActiveTargets?: boolean;
}

/** Primitive values for Imp graph parameter overrides. */
export type BlockParameterValue = string | number | boolean | null;

export interface UserSettings {
  version: typeof USER_SETTINGS_VERSION;
  /** Sparse overrides keyed by table id (see `tableSortKey` helpers). */
  tableSorts?: Record<string, TableSortSpec>;
  /** Active table tab id per node page (see `nodeTableTabKey`). */
  tableTabs?: Record<string, string>;
  /**
   * Sparse Imp graph parameter overrides per page block.
   * Outer key: `blockParametersKey(nodeId, componentId)`.
   * Inner key: parameter node id → value.
   */
  blockParameters?: Record<string, Record<string, BlockParameterValue>>;
  sidebar?: SidebarSettings;
  sequencing?: SequencingSettings;
  relationships?: RelationshipsSettings;
}

export type UserSettingsPatch = {
  tableSorts?: Record<string, TableSortSpec | null>;
  tableTabs?: Record<string, string | null>;
  /** Per-block map patches; inner `null` deletes a param; outer `null` clears the block. */
  blockParameters?: Record<string, Record<string, BlockParameterValue | null> | null>;
  sidebar?: SidebarSettings | null;
  sequencing?: SequencingSettings | null;
  /** Partial merge; `null` clears the whole section. */
  relationships?: RelationshipsSettings | null;
};

export const DEFAULT_SIDEBAR_RECENT_MAX_ITEMS = 8;
export const MAX_SIDEBAR_RECENT_MAX_ITEMS = 100;
export const MAX_RECENT_ASSOCIATION_TYPES = 10;

export const DEFAULT_TABLE_SORT: TableSortSpec = {
  orderBy: [{ column: "name", direction: "asc" }],
};

export function emptyUserSettings(): UserSettings {
  return { version: USER_SETTINGS_VERSION };
}

export function sequencingShowDependencyEdges(settings: UserSettings): boolean {
  return settings.sequencing?.showDependencyEdges === true;
}

/** Default true — only an explicit `false` override disables the filter. */
export function relationshipsOnlyActiveTargets(settings: UserSettings): boolean {
  return settings.relationships?.onlyActiveTargets !== false;
}

export function relationshipsRecentAssociationTypes(settings: UserSettings): string[] {
  const raw = settings.relationships?.recentAssociationTypes;
  return Array.isArray(raw) ? [...raw] : [];
}

/** Prepend `type` and clamp to {@link MAX_RECENT_ASSOCIATION_TYPES} unique entries. */
export function pushRecentAssociationType(
  current: readonly string[],
  type: string,
): string[] {
  const trimmed = type.trim();
  if (!trimmed) return [...current];
  return [trimmed, ...current.filter((entry) => entry !== trimmed)].slice(
    0,
    MAX_RECENT_ASSOCIATION_TYPES,
  );
}

export function sidebarRecentMaxItems(settings: UserSettings): number {
  const raw = settings.sidebar?.recentMaxItems;
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return DEFAULT_SIDEBAR_RECENT_MAX_ITEMS;
  }
  return Math.max(1, Math.min(Math.floor(raw), MAX_SIDEBAR_RECENT_MAX_ITEMS));
}

function normalizeSidebar(value: SidebarSettings | undefined): SidebarSettings | undefined {
  if (!value || typeof value.recentMaxItems !== "number" || !Number.isFinite(value.recentMaxItems)) {
    return undefined;
  }
  const recentMaxItems = sidebarRecentMaxItems({ version: USER_SETTINGS_VERSION, sidebar: value });
  if (recentMaxItems === DEFAULT_SIDEBAR_RECENT_MAX_ITEMS) return undefined;
  return { recentMaxItems };
}

function normalizeSequencing(
  value: SequencingSettings | undefined,
): SequencingSettings | undefined {
  if (!value || value.showDependencyEdges !== true) return undefined;
  return { showDependencyEdges: true };
}

function normalizeRecentAssociationTypes(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
    if (result.length >= MAX_RECENT_ASSOCIATION_TYPES) break;
  }
  return result.length > 0 ? result : undefined;
}

function normalizeRelationships(
  value: RelationshipsSettings | undefined,
): RelationshipsSettings | undefined {
  if (!value || typeof value !== "object") return undefined;
  const recentAssociationTypes = normalizeRecentAssociationTypes(value.recentAssociationTypes);
  const onlyActiveTargets = value.onlyActiveTargets === false ? false : undefined;
  const result: RelationshipsSettings = {};
  if (recentAssociationTypes) result.recentAssociationTypes = recentAssociationTypes;
  if (onlyActiveTargets === false) result.onlyActiveTargets = false;
  return Object.keys(result).length > 0 ? result : undefined;
}

/** Stable key for Imp graph parameter overrides on a page block. */
export function blockParametersKey(nodeId: string, componentId: string): string {
  return `blocks/${nodeId}/${componentId}`;
}

export function blockParametersForKey(
  settings: UserSettings,
  key: string,
): Record<string, BlockParameterValue> {
  const stored = settings.blockParameters?.[key];
  if (!stored || typeof stored !== "object") return {};
  return { ...stored };
}

function isBlockParameterValue(value: unknown): value is BlockParameterValue {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function normalizeBlockParameterMap(
  value: Record<string, unknown> | undefined,
): Record<string, BlockParameterValue> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const parsed: Record<string, BlockParameterValue> = {};
  for (const [paramId, raw] of Object.entries(value)) {
    if (!paramId || !isBlockParameterValue(raw)) continue;
    if (typeof raw === "number" && !Number.isFinite(raw)) continue;
    parsed[paramId] = raw;
  }
  return Object.keys(parsed).length > 0 ? parsed : undefined;
}

export function relationTableSortKey(nodeId: string, relationLabel: string): string {
  return `records/${nodeId}/relations/${relationLabel}`;
}

export function databaseTableSortKey(
  nodeId: string,
  databaseId: string,
  viewName: string,
): string {
  return `records/${nodeId}/database/${databaseId}/${viewName}`;
}

/** Stable key for the active table tab on a node page (one tabbed section per type-table node). */
export function nodeTableTabKey(nodeId: string): string {
  return `records/${nodeId}/tab`;
}

export function tableTabOverrideForKey(
  settings: UserSettings,
  tabKey: string,
): string | undefined {
  const stored = settings.tableTabs?.[tabKey];
  return typeof stored === "string" && stored.length > 0 ? stored : undefined;
}

/** URL tab wins when present; otherwise the saved user-settings override. */
export function effectiveTableTab(
  settings: UserSettings,
  nodeId: string,
  urlTab?: string,
): string | undefined {
  return urlTab ?? tableTabOverrideForKey(settings, nodeTableTabKey(nodeId));
}

export function isDefaultTableSort(spec: TableSortSpec): boolean {
  return (
    spec.orderBy.length === 1 &&
    spec.orderBy[0]?.column === "name" &&
    spec.orderBy[0]?.direction === "asc"
  );
}

export function normalizeTableSort(spec: TableSortSpec | undefined): TableSortSpec {
  if (!spec?.orderBy?.length) return DEFAULT_TABLE_SORT;
  const orderBy = spec.orderBy.filter(
    (entry) => typeof entry.column === "string" && entry.column.length > 0,
  );
  if (orderBy.length === 0) return DEFAULT_TABLE_SORT;
  return {
    orderBy: orderBy.map((entry) => ({
      column: entry.column,
      direction: entry.direction === "desc" ? "desc" : "asc",
    })),
  };
}

export function tableSortOverrideForKey(
  settings: UserSettings,
  tableKey: string,
): TableSortSpec | undefined {
  const stored = settings.tableSorts?.[tableKey];
  return stored ? normalizeTableSort(stored) : undefined;
}

/** User override when set; otherwise `defaultSort`, then global default (name asc). */
export function effectiveTableSort(
  settings: UserSettings,
  tableKey: string,
  defaultSort?: TableSortSpec,
): TableSortSpec {
  return tableSortOverrideForKey(settings, tableKey) ?? normalizeTableSort(defaultSort);
}

export function tableSortForKey(
  settings: UserSettings,
  tableKey: string,
): TableSortSpec {
  return effectiveTableSort(settings, tableKey);
}

export interface ViewSortLike {
  column: string;
  direction: SortDirection;
}

export function viewSortsToTableSort(sorts: ViewSortLike[]): TableSortSpec {
  const orderBy: SortColumn[] = sorts
    .filter((sort) => typeof sort.column === "string" && sort.column.length > 0)
    .map((sort) => ({
      column: sort.column,
      direction: (sort.direction === "desc" ? "desc" : "asc") as SortDirection,
    }));
  return orderBy.length > 0
    ? { orderBy }
    : DEFAULT_TABLE_SORT;
}

export function nextSortOnColumnClick(
  current: TableSortSpec,
  column: string,
): SortColumn[] {
  const primary = current.orderBy[0];
  if (primary?.column === column) {
    return [{ column, direction: primary.direction === "asc" ? "desc" : "asc" }];
  }
  return [{ column, direction: "asc" }];
}


function normalizeTableTabId(tabId: string | null | undefined): string | undefined {
  if (typeof tabId !== "string") return undefined;
  const trimmed = tabId.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function applyUserSettingsPatch(
  current: UserSettings,
  patch: UserSettingsPatch,
): UserSettings {
  const next: UserSettings = {
    version: USER_SETTINGS_VERSION,
    tableSorts: current.tableSorts ? { ...current.tableSorts } : undefined,
    tableTabs: current.tableTabs ? { ...current.tableTabs } : undefined,
    blockParameters: current.blockParameters
      ? Object.fromEntries(
          Object.entries(current.blockParameters).map(([key, map]) => [key, { ...map }]),
        )
      : undefined,
    sidebar: current.sidebar ? { ...current.sidebar } : undefined,
    sequencing: current.sequencing ? { ...current.sequencing } : undefined,
    relationships: current.relationships ? { ...current.relationships } : undefined,
  };

  if (patch.tableSorts) {
    if (!next.tableSorts) next.tableSorts = {};
    for (const [key, value] of Object.entries(patch.tableSorts)) {
      if (value === null || isDefaultTableSort(normalizeTableSort(value))) {
        delete next.tableSorts[key];
      } else {
        next.tableSorts[key] = normalizeTableSort(value);
      }
    }
    if (Object.keys(next.tableSorts).length === 0) {
      delete next.tableSorts;
    }
  }

  if (patch.tableTabs) {
    if (!next.tableTabs) next.tableTabs = {};
    for (const [key, value] of Object.entries(patch.tableTabs)) {
      const normalized = normalizeTableTabId(value);
      if (normalized) {
        next.tableTabs[key] = normalized;
      } else {
        delete next.tableTabs[key];
      }
    }
    if (Object.keys(next.tableTabs).length === 0) {
      delete next.tableTabs;
    }
  }

  if (patch.blockParameters) {
    if (!next.blockParameters) next.blockParameters = {};
    for (const [blockKey, value] of Object.entries(patch.blockParameters)) {
      if (value === null) {
        delete next.blockParameters[blockKey];
        continue;
      }
      const currentMap = { ...(next.blockParameters[blockKey] ?? {}) };
      for (const [paramId, paramValue] of Object.entries(value)) {
        if (paramValue === null) {
          delete currentMap[paramId];
        } else if (isBlockParameterValue(paramValue)) {
          if (typeof paramValue === "number" && !Number.isFinite(paramValue)) {
            delete currentMap[paramId];
          } else {
            currentMap[paramId] = paramValue;
          }
        }
      }
      if (Object.keys(currentMap).length === 0) {
        delete next.blockParameters[blockKey];
      } else {
        next.blockParameters[blockKey] = currentMap;
      }
    }
    if (Object.keys(next.blockParameters).length === 0) {
      delete next.blockParameters;
    }
  }

  if (patch.sidebar !== undefined) {
    if (patch.sidebar === null) {
      delete next.sidebar;
    } else {
      const normalized = normalizeSidebar(patch.sidebar);
      if (normalized) {
        next.sidebar = normalized;
      } else {
        delete next.sidebar;
      }
    }
  }

  if (patch.sequencing !== undefined) {
    if (patch.sequencing === null) {
      delete next.sequencing;
    } else {
      const normalized = normalizeSequencing(patch.sequencing);
      if (normalized) {
        next.sequencing = normalized;
      } else {
        delete next.sequencing;
      }
    }
  }

  if (patch.relationships !== undefined) {
    if (patch.relationships === null) {
      delete next.relationships;
    } else {
      const merged: RelationshipsSettings = { ...(next.relationships ?? {}) };
      if ("recentAssociationTypes" in patch.relationships) {
        merged.recentAssociationTypes = patch.relationships.recentAssociationTypes;
      }
      if ("onlyActiveTargets" in patch.relationships) {
        merged.onlyActiveTargets = patch.relationships.onlyActiveTargets;
      }
      const normalized = normalizeRelationships(merged);
      if (normalized) {
        next.relationships = normalized;
      } else {
        delete next.relationships;
      }
    }
  }

  return next;
}

export function parseUserSettings(raw: unknown): UserSettings {
  if (!raw || typeof raw !== "object") return emptyUserSettings();
  const record = raw as Record<string, unknown>;
  const version = record.version;
  if (version !== USER_SETTINGS_VERSION) return emptyUserSettings();

  const settings = emptyUserSettings();
  const tableSorts = record.tableSorts;
  if (tableSorts && typeof tableSorts === "object" && !Array.isArray(tableSorts)) {
    const parsed: Record<string, TableSortSpec> = {};
    for (const [key, value] of Object.entries(tableSorts)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const spec = normalizeTableSort(value as TableSortSpec);
      if (!isDefaultTableSort(spec)) {
        parsed[key] = spec;
      }
    }
    if (Object.keys(parsed).length > 0) {
      settings.tableSorts = parsed;
    }
  }

  const tableTabs = record.tableTabs;
  if (tableTabs && typeof tableTabs === "object" && !Array.isArray(tableTabs)) {
    const parsed: Record<string, string> = {};
    for (const [key, value] of Object.entries(tableTabs)) {
      const normalized = normalizeTableTabId(value as string);
      if (normalized) parsed[key] = normalized;
    }
    if (Object.keys(parsed).length > 0) {
      settings.tableTabs = parsed;
    }
  }

  const blockParameters = record.blockParameters;
  if (blockParameters && typeof blockParameters === "object" && !Array.isArray(blockParameters)) {
    const parsed: Record<string, Record<string, BlockParameterValue>> = {};
    for (const [key, value] of Object.entries(blockParameters)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const map = normalizeBlockParameterMap(value as Record<string, unknown>);
      if (map) parsed[key] = map;
    }
    if (Object.keys(parsed).length > 0) {
      settings.blockParameters = parsed;
    }
  }

  const sidebar = record.sidebar;
  if (sidebar && typeof sidebar === "object" && !Array.isArray(sidebar)) {
    const normalized = normalizeSidebar(sidebar as SidebarSettings);
    if (normalized) {
      settings.sidebar = normalized;
    }
  }

  const sequencing = record.sequencing;
  if (sequencing && typeof sequencing === "object" && !Array.isArray(sequencing)) {
    const normalized = normalizeSequencing(sequencing as SequencingSettings);
    if (normalized) {
      settings.sequencing = normalized;
    }
  }

  const relationships = record.relationships;
  if (relationships && typeof relationships === "object" && !Array.isArray(relationships)) {
    const normalized = normalizeRelationships(relationships as RelationshipsSettings);
    if (normalized) {
      settings.relationships = normalized;
    }
  }

  return settings;
}
